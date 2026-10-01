import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'

test('安全：附件 force 原子替换符号链接，不修改链接外部目标', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-download-safe-'))
  const out = path.join(dir, 'download.pdf'), outside = path.join(dir, 'protected.pdf')
  fs.writeFileSync(outside, 'keep-private')
  fs.symlinkSync(outside, out)
  const mock = await startMockServer(() => ({ headers: { 'Content-Type': 'application/pdf' }, raw: '%PDF-test' }))
  t.after(() => mock.close())
  const env = { CH_CONFIG_DIR: path.join(dir, 'config'), CH_TOKEN: makeFakeToken(Math.floor(Date.now()/1000)+3600) }
  const refused = await runCli(['uploads','attachment-download','9','--name','demo.pdf','--out',out], { baseUrl: mock.baseUrl, env })
  assert.equal(refused.code, 2)
  const result = await runCli(['uploads','attachment-download','9','--name','demo.pdf','--out',out,'--force'], { baseUrl: mock.baseUrl, env })
  assert.equal(result.code, 0, result.stdout)
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep-private')
  assert.equal(fs.lstatSync(out).isSymbolicLink(), false)
  assert.equal(fs.readFileSync(out, 'utf8'), '%PDF-test')
  assert.equal(fs.statSync(out).mode & 0o777, 0o600)
  assert.equal(fs.readdirSync(dir).some(name => name.includes('.partial-')), false)
})

test('安全：登录与鉴权请求均拒绝跨源重定向，不发送凭据到第二服务', async t => {
  let hits = 0
  const destination = await startMockServer(() => { hits++; return { json: { code: 200, data: {} } } })
  const source = await startMockServer(() => ({ status: 307, headers: { Location: `${destination.baseUrl}/capture` }, json: {} }))
  t.after(() => source.close()); t.after(() => destination.close())
  const env = { CH_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ch-redirect-safe-')), CH_TOKEN: makeFakeToken(Math.floor(Date.now()/1000)+3600) }
  for (const args of [['auth','status'], ['login','--studentNo','1234567890','--password','fictional-test-password']]) {
    const result = await runCli(args, { baseUrl: source.baseUrl, env })
    assert.notEqual(result.code, 0)
  }
  assert.equal(hits, 0)
})
