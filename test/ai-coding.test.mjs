import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'

const TOKEN = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
const ENV = { CH_TOKEN: TOKEN, CH_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ch-cli-')) }

async function captureServer(t, seen, handler) {
  const mock = await startMockServer((req) => {
    seen.push({ method: req.method, path: req.path, query: req.query, headers: req.headers, body: req.body })
    if (handler) return handler(req)
    return { status: 200, json: { code: 200, data: { items: [], total: 0 } } }
  })
  t.after(() => mock.close())
  return mock
}

function last(seen) {
  return seen[seen.length - 1]
}

test('ai plans：list 查询参数', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  await runCli(['ai', 'plans', 'list', '--page', '2', '--page-size', '5', '--status', 'PUBLISHED', '--group-id', '3'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/ai-coding/plans')
  assert.equal(last(seen).query.get('page'), '2')
  assert.equal(last(seen).query.get('pageSize'), '5')
  assert.equal(last(seen).query.get('status'), 'PUBLISHED')
  assert.equal(last(seen).query.get('groupId'), '3')
})

test('ai plans：create 注入 requestId 且时间转 +08:00', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(
    [
      'ai', 'plans', 'create',
      '--name', '2026 秋招 AI 考核',
      '--group-ids', '1,2',
      '--opens-at', '2026-09-29 10:00',
      '--closes-at', '2026-09-29 12:00',
      '--publish-at', '2026-09-30 09:00',
      '--survey-seconds', '600',
      '--coding-seconds', '3600',
      '--reflection-seconds', '900',
      '--reflection-mode', 'PERSONALIZED',
    ],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 0, res.stderr)
  const body = last(seen).body
  assert.match(body.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(body.name, '2026 秋招 AI 考核')
  assert.deepEqual(body.groupIds, ['1', '2'])
  assert.equal(body.opensAt, '2026-09-29T10:00:00+08:00')
  assert.equal(body.closesAt, '2026-09-29T12:00:00+08:00')
  assert.equal(body.publishAt, '2026-09-30T09:00:00+08:00')
  assert.deepEqual(body.durations, { surveySeconds: 600, codingSeconds: 3600, reflectionSeconds: 900 })
  assert.equal(body.reflectionMode, 'PERSONALIZED')
})

test('ai plans：create 支持 --request-id 复用（服务端去重）', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  await runCli(
    ['ai', 'plans', 'create', '--name', 'x', '--group-ids', '1', '--request-id', 'req-fixed-1'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(last(seen).body.requestId, 'req-fixed-1')
})

test('ai plans：update 自动重读 version 并在冲突后重试', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'GET' && req.path === '/api/admin/ai-coding/plans/p1') {
      const puts = seen.filter((s) => s.method === 'PUT')
      return { status: 200, json: { code: 200, data: { id: 'p1', version: puts.length === 0 ? 2 : 3, models: [{ id: 'm1', keyVersion: 1 }] } } }
    }
    if (req.method === 'PUT' && req.path === '/api/admin/ai-coding/plans/p1') {
      if (req.body.version !== 3) {
        return { status: 409, json: { code: 409, message: '版本冲突', data: { reasonCode: 'VERSION_CONFLICT', currentVersion: 3 } } }
      }
      return { status: 200, json: { code: 200, data: { id: 'p1', version: 3 } } }
    }
    return { status: 200, json: { code: 200, data: { items: [] } } }
  })
  const res = await runCli(
    ['ai', 'plans', 'update', 'p1', '--name', '新名', '--group-ids', '1'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 0, res.stderr)
  const puts = seen.filter((s) => s.method === 'PUT')
  assert.equal(puts.length, 2)
  assert.equal(puts[0].body.version, 2)
  assert.equal(puts[1].body.version, 3)
  assert.equal(puts[1].body.name, '新名')
  assert.match(res.stderr, /自动重读重试/)
})

test('ai plans：显式 --request-id 只作用于首次请求，重试必须换新 id', async (t) => {
  // 后端 AiCodingOperations.replay() 对「同 requestId + 不同 bodyHash」抛
  // IDEMPOTENCY_CONFLICT。版本冲突重试的 body 里 version 一定变了，沿用同一个 id
  // 会让自动重试 100% 失败——带 --request-id 的写操作因此永远卡在冲突上。
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'GET' && req.path === '/api/admin/ai-coding/plans/p1') {
      const puts = seen.filter((s) => s.method === 'PUT')
      return { status: 200, json: { code: 200, data: { id: 'p1', version: puts.length === 0 ? 2 : 3, models: [] } } }
    }
    if (req.method === 'PUT' && req.path === '/api/admin/ai-coding/plans/p1') {
      if (req.body.version !== 3) {
        return { status: 409, json: { code: 409, message: '版本冲突', data: { reasonCode: 'VERSION_CONFLICT', currentVersion: 3 } } }
      }
      return { status: 200, json: { code: 200, data: { id: 'p1', version: 3 } } }
    }
    return { status: 200, json: { code: 200, data: { items: [] } } }
  })
  const res = await runCli(
    ['ai', 'plans', 'update', 'p1', '--name', '新名', '--group-ids', '1', '--request-id', 'rid-fixed'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 0, res.stderr)
  const puts = seen.filter((s) => s.method === 'PUT')
  assert.equal(puts.length, 2)
  assert.equal(puts[0].body.requestId, 'rid-fixed', '首次请求要用调用方给的 id，服务端才能去重')
  assert.notEqual(puts[1].body.requestId, 'rid-fixed', '重试必须换新 id，否则后端判 IDEMPOTENCY_CONFLICT')
  assert.match(res.stderr, /新的 requestId/)
})

test('ai plans：--request-id 优先于 -d 里的 requestId', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, () => ({ status: 200, json: { code: 200, data: { items: [] } } }))
  await runCli(
    ['ai', 'plans', 'create', '--name', 'n', '--group-ids', '1', '--request-id', 'from-flag', '-d', '{"requestId":"from-body"}'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(last(seen).body.requestId, 'from-flag')
})

test('ai plans：publish / withdraw / starts / publication 载荷', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'GET') return { status: 200, json: { code: 200, data: { id: 'p1', version: 7, models: [] } } }
    return { status: 200, json: { code: 200, data: { id: 'p1', version: 7 } } }
  })

  await runCli(['ai', 'plans', 'publish', 'p1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'POST')
  assert.equal(last(seen).path, '/api/admin/ai-coding/plans/p1/publish')
  assert.equal(last(seen).body.version, 7)

  const noReason = await runCli(['ai', 'plans', 'withdraw', 'p1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(noReason.code, 2)
  await runCli(['ai', 'plans', 'withdraw', 'p1', '--reason', '题目出错'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/ai-coding/plans/p1/withdraw')
  assert.deepEqual(last(seen).body.reason, '题目出错')

  await runCli(['ai', 'plans', 'starts', 'p1', '--paused', 'true', '--reason', '服务器维护'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'PATCH')
  assert.equal(last(seen).path, '/api/admin/ai-coding/plans/p1/starts')
  assert.equal(last(seen).body.paused, true)

  await runCli(['ai', 'plans', 'publication', 'p1', '--publish-at', '2026-09-30 09:00', '--reason', '延期'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/ai-coding/plans/p1/publication')
  assert.equal(last(seen).body.publishAt, '2026-09-30T09:00:00+08:00')
})

test('ai plans：credential 自动重读 keyVersion', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'GET') return { status: 200, json: { code: 200, data: { models: [{ id: 'm1', keyVersion: 4 }] } } }
    return { status: 200, json: { code: 200, data: { modelId: 'm1', keyConfigured: true, keyVersion: 5 } } }
  })
  const res = await runCli(
    ['ai', 'plans', 'credential', 'p1', 'm1', '--api-key', 'sk-test', '--reason', '定期轮换'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 0, res.stderr)
  assert.equal(last(seen).method, 'PUT')
  assert.equal(last(seen).path, '/api/admin/ai-coding/plans/p1/models/m1/credential')
  assert.equal(last(seen).body.keyVersion, 4)
  assert.equal(last(seen).body.apiKey, 'sk-test')
  assert.equal(last(seen).body.reason, '定期轮换')
})

test('ai attempts：grade 使用 attempt.version 作 expectedRevision 且重试', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'GET' && req.path === '/api/admin/ai-coding/attempts/a1') {
      const grades = seen.filter((s) => s.method === 'PUT')
      return { status: 200, json: { code: 200, data: { attempt: { id: 'a1', version: grades.length === 0 ? 5 : 6 } } } }
    }
    if (req.method === 'PUT' && req.path === '/api/admin/ai-coding/attempts/a1/grade') {
      if (req.body.expectedRevision !== 6) {
        return { status: 409, json: { code: 409, message: '评分版本冲突', data: { reasonCode: 'GRADE_VERSION_CONFLICT', currentVersion: 6 } } }
      }
      return { status: 200, json: { code: 200, data: { attemptId: 'a1', score: 90, revision: 6 } } }
    }
    return { status: 200, json: { code: 200, data: { items: [] } } }
  })
  const res = await runCli(
    ['ai', 'attempts', 'grade', 'a1', '--score', '90', '--public-comment', '思路清晰', '--internal-comment', '内评'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 0, res.stderr)
  const grades = seen.filter((s) => s.method === 'PUT')
  assert.equal(grades.length, 2)
  assert.equal(grades[0].body.expectedRevision, 5)
  assert.equal(grades[1].body.expectedRevision, 6)
  assert.equal(grades[1].body.score, 90)
  assert.equal(grades[1].body.publicComment, '思路清晰')
  assert.equal(grades[1].body.internalComment, '内评')
})

test('ai attempts：void 缺 reason → exit 2；带 reason 正常', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'GET') return { status: 200, json: { code: 200, data: { attempt: { id: 'a1', version: 2 } } } }
    return { status: 200, json: { code: 200, data: { id: 'a1', state: 'VOIDED' } } }
  })
  const noReason = await runCli(['ai', 'attempts', 'void', 'a1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(noReason.code, 2)
  await runCli(['ai', 'attempts', 'void', 'a1', '--reason', '作弊'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/ai-coding/attempts/a1/void')
  assert.equal(last(seen).body.version, 2)
  assert.equal(last(seen).body.reason, '作弊')
})

test('ai candidates：list 与 retake（时间 +08:00、reason 必填）', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  await runCli(['ai', 'candidates', 'list', '--eligibility', 'REQUIRED', '--keyword', '张三'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/ai-coding/candidates')
  assert.equal(last(seen).query.get('eligibility'), 'REQUIRED')
  assert.equal(last(seen).query.get('keyword'), '张三')

  const noReason = await runCli(
    ['ai', 'candidates', 'retake', '42', '--plan-id', 'p1', '--assignment-version', '3', '--opens-at', '2026-09-29 10:00', '--closes-at', '2026-09-29 12:00'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(noReason.code, 2)

  await runCli(
    ['ai', 'candidates', 'retake', '42', '--plan-id', 'p1', '--assignment-version', '3', '--opens-at', '2026-09-29 10:00', '--closes-at', '2026-09-29 12:00', '--reason', '断网重考'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(last(seen).path, '/api/admin/ai-coding/candidates/42/retake')
  assert.equal(last(seen).body.assignmentVersion, 3)
  assert.equal(last(seen).body.opensAt, '2026-09-29T10:00:00+08:00')
  assert.equal(last(seen).body.closesAt, '2026-09-29T12:00:00+08:00')
})

test('ai：未知子命令 → exit 2', async () => {
  const res = await runCli(['ai', 'plans', 'frobnicate'], { env: ENV, baseUrl: 'http://127.0.0.1:1/api' })
  assert.equal(res.code, 2)
})
