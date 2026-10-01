import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'

function tempConfigDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ch-cli-'))
}

test('renewal：whoami 响应头的 X-Renewed-Token 自动换存会话', async (t) => {
  const token1 = makeFakeToken(Math.floor(Date.now() / 1000) + 3600)
  const token2 = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
  const configDir = tempConfigDir()
  t.after(() => fs.rmSync(configDir, { recursive: true, force: true }))

  const mock = await startMockServer((req) => {
    if (req.method === 'POST' && req.path === '/api/auth/login') {
      return { status: 200, json: { code: 200, data: { token: token1, userId: 7, studentNo: 'admin', role: 2 } } }
    }
    if (req.method === 'GET' && req.path === '/api/admin/profile') {
      // 后端 X-Token-Expires-At 为 epoch 毫秒（JwtInterceptor：now + expirationMillis）
      const renewedExpiresAt = Date.now() + 86400 * 1000
      return {
        status: 200,
        headers: { 'X-Renewed-Token': token2, 'X-Token-Expires-At': String(renewedExpiresAt) },
        json: { code: 200, data: { userId: 7, adminLevel: 'SYSTEM' } },
      }
    }
    return undefined
  })
  t.after(() => mock.close())

  const env = { CH_CONFIG_DIR: configDir, CH_BASE_URL: mock.baseUrl }
  const login = await runCli(['login', '--studentNo', 'admin', '--password', 'x'], { env })
  assert.equal(login.code, 0, login.stderr)
  assert.equal(JSON.parse(fs.readFileSync(path.join(configDir, 'session.json'), 'utf8')).token, token1)

  const who = await runCli(['whoami'], { env })
  assert.equal(who.code, 0, who.stderr)
  const saved = JSON.parse(fs.readFileSync(path.join(configDir, 'session.json'), 'utf8'))
  assert.equal(saved.token, token2, '续期头必须换存到磁盘会话')
  assert.ok(saved.expiresAt > Date.now(), 'X-Token-Expires-At 必须写入')
})

test('checkin snapshot：screenToken 仅经 header、绝不携带 JWT、按组别重复传参', async (t) => {
  const mock = await startMockServer((req) => {
    if (req.method === 'GET' && req.path === '/api/checkin-screens/current') {
      assert.equal(req.headers['x-checkin-screen-token'], 'screen-xyz')
      assert.equal(req.headers.authorization, undefined, '大屏请求绝不携带管理员 JWT')
      assert.deepEqual(req.query.getAll('groupId'), ['1', '3'])
      return { status: 200, json: { code: 200, data: { slots: [] } } }
    }
    return undefined
  })
  t.after(() => mock.close())

  const ok = await runCli(
    ['checkin', 'snapshot', '--screen-token', 'screen-xyz', '--group-id', '1', '--group-id', '3'],
    { baseUrl: mock.baseUrl, env: { CH_TOKEN: 'should-not-be-sent', CH_CONFIG_DIR: tempConfigDir() } },
  )
  assert.equal(ok.code, 0, ok.stderr)

  const missing = await runCli(['checkin', 'snapshot'], { baseUrl: mock.baseUrl, env: { CH_CONFIG_DIR: tempConfigDir() } })
  assert.equal(missing.code, 2)
  assert.match(JSON.parse(missing.stdout).error.message, /screen-token/)
})

test('checkin launch：创建大屏会话', async (t) => {
  const mock = await startMockServer((req) => {
    if (req.method === 'POST' && req.path === '/api/admin/checkin-screens') {
      return { status: 200, json: { code: 200, data: { screenToken: 'screen-abc', expiresAt: '2026-09-27T00:00:00' } } }
    }
    return undefined
  })
  t.after(() => mock.close())
  const res = await runCli(['checkin', 'launch'], {
    baseUrl: mock.baseUrl,
    env: { CH_TOKEN: 't', CH_CONFIG_DIR: tempConfigDir() },
  })
  assert.equal(res.code, 0, res.stderr)
  assert.equal(JSON.parse(res.stdout).data.screenToken, 'screen-abc')
})

test('feishu：status / conflicts / reconcile', async (t) => {
  const seen = []
  const mock = await startMockServer((req) => {
    seen.push({ method: req.method, path: req.path })
    return { status: 200, json: { code: 200, data: { enabled: true } } }
  })
  t.after(() => mock.close())
  const env = { CH_TOKEN: 't', CH_CONFIG_DIR: tempConfigDir(), CH_BASE_URL: mock.baseUrl }
  await runCli(['feishu', 'status'], { env })
  await runCli(['feishu', 'conflicts'], { env })
  await runCli(['feishu', 'reconcile'], { env })
  assert.deepEqual(seen.map((s) => `${s.method} ${s.path}`), [
    'GET /api/admin/feishu/status',
    'GET /api/admin/feishu/conflicts',
    'POST /api/admin/feishu/reconcile',
  ])
})
