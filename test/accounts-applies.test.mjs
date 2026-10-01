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
    return { status: 200, json: { code: 200, data: { ok: true } } }
  })
  t.after(() => mock.close())
  return mock
}

function last(seen) {
  return seen[seen.length - 1]
}

test('accounts：学号/密码/级别本地校验', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const badStudentNo = await runCli(
    ['accounts', 'create', '--studentNo', '123', '--password', 'secret1', '--admin-level', 'REGULAR'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(badStudentNo.code, 2)
  assert.match(JSON.parse(badStudentNo.stdout).error.message, /10 位/)

  const badPassword = await runCli(
    ['accounts', 'create', '--studentNo', '2026000001', '--password', '123', '--admin-level', 'REGULAR'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(badPassword.code, 2)

  const badLevel = await runCli(
    ['accounts', 'create', '--studentNo', '2026000001', '--password', 'secret1', '--admin-level', 'SYSTEM'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(badLevel.code, 2)

  await runCli(
    ['accounts', 'create', '--studentNo', '2026000001', '--password', 'secret1', '--admin-level', 'REGULAR', '--real-name', '新人', '--authorized-group-ids', '1,2'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.deepEqual(last(seen).body, {
    studentNo: '2026000001',
    password: 'secret1',
    adminLevel: 'REGULAR',
    realName: '新人',
    authorizedGroupIds: [1, 2],
  })
})

test('accounts：reset-password / delete / update 至少一字段', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  await runCli(['accounts', 'reset-password', '9', '--password', 'newpass1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'PUT')
  assert.equal(last(seen).path, '/api/admin/accounts/9/password')

  await runCli(['accounts', 'delete', '9'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'DELETE')

  const noField = await runCli(['accounts', 'update', '9'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(noField.code, 2)

  await runCli(['accounts', 'update', '9', '--admin-level', 'SUPER'], { baseUrl: mock.baseUrl, env: ENV })
  assert.deepEqual(last(seen).body, { adminLevel: 'SUPER' })
})

test('applies：reject 缺 reason → exit 2；approve 正常', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const missing = await runCli(['applies', 'reject', '3'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(missing.code, 2)
  assert.match(JSON.parse(missing.stdout).error.message, /reason/)

  await runCli(['applies', 'reject', '3', '--reason', '材料不全'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/account-applications/3/reject')
  assert.deepEqual(last(seen).body, { reason: '材料不全' })

  await runCli(['applies', 'approve', '3'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'POST')
  assert.equal(last(seen).path, '/api/admin/account-applications/3/approve')
})

test('applies：公开端点免登录（status / submit 不带 Authorization）', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-cli-'))
  const env = { CH_CONFIG_DIR: configDir, CH_BASE_URL: mock.baseUrl }

  const status = await runCli(['applies', 'status', '2026000001'], { baseUrl: mock.baseUrl, env })
  assert.equal(status.code, 0)
  assert.equal(last(seen).headers.authorization, undefined)
  assert.equal(last(seen).query.get('studentNo'), '2026000001')

  await runCli(['applies', 'submit', '--studentNo', '2026000001', '--real-name', '张三', '--position-code', 'MEMBER'], { baseUrl: mock.baseUrl, env })
  assert.equal(last(seen).headers.authorization, undefined)
  assert.deepEqual(last(seen).body, { studentNo: '2026000001', realName: '张三', positionCode: 'MEMBER' })
})

test('profile：update 与 change-password', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  await runCli(['profile', 'update', '--real-name', '李四', '--phone', '13800000000'], { baseUrl: mock.baseUrl, env: ENV })
  assert.deepEqual(last(seen).body, { realName: '李四', phone: '13800000000' })
  await runCli(['profile', 'change-password', '--password', 'newpass1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/profile/password')
})

test('candidates 写：star / application-status / second-round-groups / unbind-wechat', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  await runCli(['candidates', 'star', '42', '--starred', 'true'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'POST')
  assert.equal(last(seen).path, '/api/admin/candidates/42/star')
  assert.deepEqual(last(seen).body, { starred: true })

  await runCli(['candidates', 'application-status', '42', '--status', '2'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'PATCH')
  assert.deepEqual(last(seen).body, { status: 2 })

  await runCli(['candidates', 'set-second-round-groups', '42', '--group-ids', '1,3'], { baseUrl: mock.baseUrl, env: ENV })
  assert.deepEqual(last(seen).body, { groupIds: [1, 3] })

  const missingReason = await runCli(['candidates', 'unbind-wechat', '42'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(missingReason.code, 2)
  await runCli(['candidates', 'unbind-wechat', '42', '--reason', '候选人换绑微信'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'DELETE')
  assert.equal(last(seen).path, '/api/admin/users/42/wechat-binding')
  assert.deepEqual(last(seen).body, { reason: '候选人换绑微信' })
})

test('candidates：set-third-round-choice 自动重读 version（冲突后重试成功）', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'GET' && req.path === '/api/admin/users/42/third-round-choice') {
      const puts = seen.filter((s) => s.method === 'PUT')
      const version = puts.length === 0 ? 3 : 4
      return { status: 200, json: { code: 200, data: { version, eligibleGroups: [], canConfirm: true } } }
    }
    if (req.method === 'PUT' && req.path === '/api/admin/users/42/third-round-choice') {
      if (req.body.version !== 4) {
        return { status: 409, json: { code: 409, message: '版本冲突', data: { reasonCode: 'VERSION_CONFLICT', currentVersion: 4 } } }
      }
      return { status: 200, json: { code: 200, data: { version: 4, state: 'SELECTED' } } }
    }
    return { status: 200, json: { code: 200, data: null } }
  })

  const res = await runCli(
    ['candidates', 'set-third-round-choice', '42', '--group-id', '5', '--reason', '学生申请调整'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 0, res.stderr)
  const puts = seen.filter((s) => s.method === 'PUT')
  assert.equal(puts.length, 2, '第一次 version=3 冲突，重读 version=4 后成功')
  assert.equal(puts[0].body.version, 3)
  assert.equal(puts[1].body.version, 4)
  assert.equal(puts[1].body.groupId, 5)
  assert.equal(puts[1].body.reason, '学生申请调整')
  assert.match(res.stderr, /自动重读重试 1\/2/)
})

test('candidates：set-third-round-choice 显式 --version 不自动重试', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen, (req) => {
    if (req.method === 'PUT') {
      return { status: 409, json: { code: 409, message: '版本冲突', data: { reasonCode: 'VERSION_CONFLICT', currentVersion: 9 } } }
    }
    return { status: 200, json: { code: 200, data: { version: 3 } } }
  })
  const res = await runCli(
    ['candidates', 'set-third-round-choice', '42', '--group-id', '5', '--reason', 'x', '--version', '3'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(res.code, 6)
  assert.equal(seen.filter((s) => s.method === 'PUT').length, 1)
  assert.equal(seen.filter((s) => s.method === 'GET').length, 0, '显式 version 不触发重读')
})
