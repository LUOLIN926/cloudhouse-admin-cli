import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'

function tempConfigDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ch-cli-'))
}

const TOKEN = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
const ENV = { CH_TOKEN: TOKEN, CH_CONFIG_DIR: tempConfigDir() }

/** 捕获全部请求的 mock 后端（自动关闭） */
async function captureServer(t, seen) {
  const mock = await startMockServer((req) => {
    seen.push({ method: req.method, path: req.path, query: req.query, headers: req.headers })
    return { status: 200, json: { code: 200, data: { ok: true } } }
  })
  t.after(() => mock.close())
  return mock
}

test('reads：dashboard', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(['dashboard'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 0)
  assert.equal(seen[0].path, '/api/admin/dashboard')
  assert.match(seen[0].headers.authorization, /^Bearer /)
})

test('reads：candidates list 默认分页参数与筛选序列化', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(
    ['candidates', 'list', '--keyword', '张三', '--status', '1', '--second-round-group-id', '3', '--starred', 'true'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 0)
  assert.equal(seen[0].path, '/api/admin/users/info/page')
  const q = seen[0].query
  assert.equal(q.get('page'), '1')
  assert.equal(q.get('size'), '20')
  assert.equal(q.get('thirdRoundChoiceState'), 'ALL')
  assert.equal(q.get('keyword'), '张三')
  assert.equal(q.get('status'), '1')
  assert.equal(q.get('secondRoundGroupId'), '3')
  assert.equal(q.get('starred'), 'true')
})

test('reads：candidates list 支持显式 page/size', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(['candidates', 'list', '--page', '3', '--size', '50'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 0)
  assert.equal(seen[0].query.get('page'), '3')
  assert.equal(seen[0].query.get('size'), '50')
})

test('reads：candidates get / application / interviews / evaluations', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  for (const [args, expectedPath] of [
    [['candidates', 'get', '42'], '/api/users/42/info'],
    [['candidates', 'application', '42'], '/api/users/42/application'],
    [['candidates', 'interviews', '42'], '/api/users/42/interviews'],
    [['candidates', 'evaluations', '42'], '/api/admin/candidates/42/evaluations'],
  ]) {
    const res = await runCli(args, { baseUrl: mock.baseUrl, env: ENV })
    assert.equal(res.code, 0, `${args.join(' ')} → ${res.stderr}`)
    assert.equal(seen[seen.length - 1].path, expectedPath)
  }
})

test('reads：candidates get 缺少 userId → exit 2', async () => {
  const res = await runCli(['candidates', 'get'], { baseUrl: 'http://127.0.0.1:1/api', env: ENV })
  assert.equal(res.code, 2)
})

test('reads：plans / slots 筛选参数', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  await runCli(['plans', 'list', '--round', '2', '--scope-group-id', '5'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen[0].path, '/api/admin/interview-plans')
  assert.equal(seen[0].query.get('round'), '2')
  assert.equal(seen[0].query.get('scopeGroupId'), '5')

  await runCli(['slots', 'list', '--plan-id', '9', '--status', '1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen[1].path, '/api/admin/interview-slots')
  assert.equal(seen[1].query.get('planId'), '9')
  assert.equal(seen[1].query.get('status'), '1')

  await runCli(['slots', 'qr', '101'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen[2].path, '/api/admin/interview-slots/101/checkin-qr')
})

test('reads：interviews list 缺少 --round → exit 2；带 round 正常', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const missing = await runCli(['interviews', 'list'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(missing.code, 2)
  assert.match(missing.stderr, /round/)

  const ok = await runCli(['interviews', 'list', '--round', '1', '--group-id', '2', '--result', '1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(ok.code, 0)
  assert.equal(seen[0].path, '/api/admin/interviews')
  assert.equal(seen[0].query.get('round'), '1')
  assert.equal(seen[0].query.get('groupId'), '2')
  assert.equal(seen[0].query.get('result'), '1')
})

test('reads：interviews search / statistics / reschedule-options', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  await runCli(['interviews', 'search', '--keyword', '李四'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen[0].path, '/api/admin/interviews/search')
  assert.equal(seen[0].query.get('keyword'), '李四')

  await runCli(['interviews', 'statistics', '--round', '1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen[1].path, '/api/admin/interviews/statistics')

  await runCli(['interviews', 'reschedule-options', '77'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen[2].path, '/api/admin/interviews/77/reschedule-options')
})

test('reads：help 列出全部新命令', async () => {
  const res = await runCli(['help'], { env: { CH_CONFIG_DIR: tempConfigDir() } })
  assert.equal(res.code, 0)
  for (const name of ['dashboard', 'groups list', 'candidates list', 'plans list', 'slots list', 'interviews list', 'interviews search']) {
    assert.ok(res.stdout.includes(name), `help 缺少 ${name}`)
  }
})
