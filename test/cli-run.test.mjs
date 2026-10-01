import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'

function tempConfigDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ch-cli-'))
}

async function withServer(t, handler) {
  const mock = await startMockServer(handler)
  t.after(() => mock.close())
  return mock
}

const LOGIN_HANDLER = ({ method, path }) => {
  if (method === 'POST' && path === '/api/auth/login') {
    return { status: 200, json: { code: 200, data: { token: makeFakeToken(Math.floor(Date.now() / 1000) + 86400), userId: 7, studentNo: 'admin', role: 2 } } }
  }
  return undefined
}

test('cli：help 列出命令与退出码', async (t) => {
  const { code, stdout } = await runCli(['help'])
  assert.equal(code, 0)
  assert.match(stdout, /ch — CloudHouse/)
  assert.match(stdout, /login/)
  assert.match(stdout, /通用兜底/)
  assert.match(stdout, /9 端点未实现/)
})

test('cli：login → 会话落盘 → whoami 免登', async (t) => {
  const mock = await withServer(t, (req) => {
    if (req.method === 'POST' && req.path === '/api/auth/login') {
      assert.deepEqual(req.body, { studentNo: 'admin', password: 'secret' })
      return { status: 200, json: { code: 200, data: { token: makeFakeToken(Math.floor(Date.now() / 1000) + 86400), userId: 7, studentNo: 'admin', role: 2 } } }
    }
    if (req.method === 'GET' && req.path === '/api/admin/profile') {
      assert.match(req.headers.authorization, /^Bearer /)
      return { status: 200, json: { code: 200, data: { userId: 7, adminLevel: 'SYSTEM', authorizedGroups: [] } } }
    }
    return undefined
  })
  const configDir = tempConfigDir()
  t.after(() => fs.rmSync(configDir, { recursive: true, force: true }))

  const login = await runCli(['login', '--studentNo', 'admin', '--password', 'secret'], { baseUrl: mock.baseUrl, env: { CH_CONFIG_DIR: configDir } })
  assert.equal(login.code, 0)
  const loginOut = JSON.parse(login.stdout)
  assert.equal(loginOut.ok, true)
  assert.equal(loginOut.data.loggedIn, true)
  assert.equal(loginOut.data.token, undefined, 'login 默认不回显 token')
  assert.ok(!('token' in loginOut.data))

  const sessionFile = path.join(configDir, 'session.json')
  assert.ok(fs.existsSync(sessionFile))
  const saved = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
  assert.equal(saved.studentNo, 'admin')
  assert.equal(saved.role, 2)
  assert.ok(typeof saved.expiresAt === 'number', 'expiresAt 由本地 JWT 解码写入')

  const who = await runCli(['whoami'], { baseUrl: mock.baseUrl, env: { CH_CONFIG_DIR: configDir } })
  assert.equal(who.code, 0)
  const whoOut = JSON.parse(who.stdout)
  assert.equal(whoOut.ok, true)
  assert.equal(whoOut.data.profile.adminLevel, 'SYSTEM')
  assert.equal(whoOut.data.session.tokenSource, '本地会话文件')
})

test('cli：api 兜底调用成功，stdout 为单行 JSON 信封', async (t) => {
  const mock = await withServer(t, (req) => {
    if (req.method === 'GET' && req.path === '/api/admin/dashboard') {
      return { status: 200, json: { code: 200, data: { applicants: 3, admitted: 1 } } }
    }
    return undefined
  })
  const res = await runCli(['api', 'GET', '/admin/dashboard'], {
    baseUrl: mock.baseUrl,
    env: { CH_TOKEN: 'test-token', CH_CONFIG_DIR: tempConfigDir() },
  })
  assert.equal(res.code, 0)
  assert.equal(res.stdout.trim(), '{"ok":true,"data":{"admitted":1,"applicants":3}}')
  assert.equal(res.stdout.trimEnd().split('\n').length, 1, 'stdout 只允许一行信封')
})

test('cli：api 兜底带 query/body/header，公开端点不带 Authorization', async (t) => {
  const mock = await withServer(t, (req) => {
    if (req.method === 'POST' && req.path === '/api/account-applications') {
      assert.equal(req.headers.authorization, undefined)
      assert.equal(req.query.get('trace'), '1')
      assert.deepEqual(req.body, { studentNo: '20260001' })
      return { status: 200, json: { code: 200, data: { id: 1 } } }
    }
    return undefined
  })
  const res = await runCli(
    ['api', 'POST', '/account-applications', '-q', 'trace=1', '-d', '{"studentNo":"20260001"}', '--public'],
    { baseUrl: mock.baseUrl, env: { CH_TOKEN: 'should-not-be-sent', CH_CONFIG_DIR: tempConfigDir() } },
  )
  assert.equal(res.code, 0)
  assert.deepEqual(JSON.parse(res.stdout).data, { id: 1 })
})

test('cli：错误分类 → exit code 语义', async (t) => {
  const token = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
  const mock = await withServer(t, (req) => {
    if (req.path === '/api/auth/login' && req.method === 'POST') {
      return { status: 200, json: { code: 200, data: { token, userId: 1, studentNo: 'admin', role: 2 } } }
    }
    switch (req.path) {
      case '/api/any/auth':
        return { status: 401, json: { code: 401, message: 'token 过期', data: { reasonCode: 'TOKEN_EXPIRED' } } }
      case '/api/any/perm':
        // AI Coding 新端点走 AiCodingControllerAdvice，HTTP 状态与 body code 一致
        return { status: 403, json: { code: 403, message: '无权限' } }
      case '/api/any/perm-body':
        // 既有端点的权限拒绝全部是这个形状：Result.error(403, …) 是纯 POJO，
        // 无 @ResponseStatus 也无 ResponseBodyAdvice，HTTP 恒为 200（全仓 114 处）。
        // 早先这条 mock 用的是 HTTP 403，测的其实是后端永远不会走的路径。
        return { status: 200, json: { code: 403, message: '无权查看全量候选人信息' } }
      case '/api/any/not-logged-in':
        // 业务层自查身份的 401（如 InterviewAttendanceServiceImpl:87），同样是 HTTP 200
        return { status: 200, json: { code: 401, message: '未登录' } }
      case '/api/any/rate':
        return { status: 429, json: { code: 429, message: 'Too Many Requests' }, headers: { 'Retry-After': '12' } }
      case '/api/any/missing':
        // 本项目后端未映射路径返回 HTTP 200 + code=404
        return { status: 200, json: { code: 404, message: '接口不存在' } }
      case '/api/any/conflict':
        return { status: 409, json: { code: 409, message: '版本冲突', data: { reasonCode: 'VERSION_CONFLICT', currentVersion: 5 } } }
      case '/api/any/feature':
        return { status: 200, json: { code: 503, message: '功能未开启', data: { reasonCode: 'FEATURE_DISABLED' } } }
      default:
        return undefined
    }
  })
  const env = { CH_TOKEN: token, CH_CONFIG_DIR: tempConfigDir() }

  const auth = await runCli(['api', 'GET', '/any/auth'], { baseUrl: mock.baseUrl, env })
  assert.equal(auth.code, 3)
  assert.equal(JSON.parse(auth.stdout).error.code, 'AUTH_EXPIRED')
  assert.equal(JSON.parse(auth.stdout).error.reasonCode, 'TOKEN_EXPIRED')

  const perm = await runCli(['api', 'GET', '/any/perm'], { baseUrl: mock.baseUrl, env })
  assert.equal(perm.code, 4)

  const permBody = await runCli(['api', 'GET', '/any/perm-body'], { baseUrl: mock.baseUrl, env })
  assert.equal(permBody.code, 4, 'HTTP 200 + code:403 必须是权限不足，否则 exit 4 对既有端点不可达')
  assert.equal(JSON.parse(permBody.stdout).error.code, 'PERMISSION_DENIED')
  assert.equal(JSON.parse(permBody.stdout).error.httpStatus, 200)

  // 非登录端点的 HTTP 200 + code:401 是「会话没被认出来」，不能提示密码错误
  const anon401 = await runCli(['api', 'GET', '/any/not-logged-in'], { baseUrl: mock.baseUrl, env })
  assert.equal(anon401.code, 3)
  assert.equal(JSON.parse(anon401.stdout).error.code, 'AUTH_EXPIRED')
  assert.doesNotMatch(JSON.parse(anon401.stdout).error.hint, /账号或密码错误/)
  assert.doesNotMatch(JSON.parse(anon401.stdout).error.hint, /限流/)
  assert.match(JSON.parse(anon401.stdout).error.hint, /ch login|ch whoami/)

  const rate = await runCli(['api', 'GET', '/any/rate'], { baseUrl: mock.baseUrl, env })
  assert.equal(rate.code, 5)
  assert.match(rate.stderr, /12 秒后重试/)

  const missing = await runCli(['api', 'GET', '/any/missing'], { baseUrl: mock.baseUrl, env })
  assert.equal(missing.code, 9)

  const conflict = await runCli(['api', 'GET', '/any/conflict'], { baseUrl: mock.baseUrl, env })
  assert.equal(conflict.code, 6)

  const feature = await runCli(['api', 'GET', '/any/feature'], { baseUrl: mock.baseUrl, env })
  assert.equal(feature.code, 8)
})

test('cli：会话与目标 baseUrl 不一致时拒绝跨环境凭据，损坏会话报 SESSION_DAMAGED', async (t) => {
  const dir = tempConfigDir()
  const token = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
  const mock = await withServer(t, (req) => {
    if (req.method === 'POST' && req.path === '/api/auth/login') {
      return { status: 200, json: { code: 200, data: { token, userId: 7, studentNo: 'admin', role: 2 } } }
    }
    return { status: 200, json: { code: 200, data: { ok: true } } }
  })
  const login = await runCli(['login', '--studentNo', 'admin', '--password', 'secret'], { baseUrl: mock.baseUrl, env: { CH_CONFIG_DIR: dir } })
  assert.equal(login.code, 0, login.stderr)

  // 会话只有一份，登录后把请求指到别的主机：过去把生产 token 静默发给任意 baseUrl
  const elsewhere = await runCli(['dashboard'], { baseUrl: 'http://127.0.0.1:1/api', env: { CH_CONFIG_DIR: dir } })
  assert.match(elsewhere.stdout, /本地会话来自/)
  assert.match(elsewhere.stdout, /Bearer Token/)
  assert.equal(elsewhere.code, 2, '默认拒绝发送跨环境凭据')

  const allowed = await runCli(['dashboard', '--allow-profile-mismatch'], { baseUrl: 'http://127.0.0.1:1/api', env: { CH_CONFIG_DIR: dir } })
  assert.match(allowed.stderr, /--allow-profile-mismatch 放行/)
  assert.doesNotMatch(allowed.stderr, /警告：本地会话来自/)

  fs.writeFileSync(path.join(dir, 'session.json'), '{broken')
  const damaged = await runCli(['dashboard'], { baseUrl: mock.baseUrl, env: { CH_CONFIG_DIR: dir } })
  assert.equal(damaged.code, 3, damaged.stdout)
  assert.equal(JSON.parse(damaged.stdout).error.code, 'SESSION_DAMAGED')
  assert.match(JSON.parse(damaged.stdout).error.message, /不是合法 JSON/)
})

test('cli：未登录直接调用 → exit 3 并提示 ch login', async (t) => {
  const mock = await withServer(t, LOGIN_HANDLER)
  const res = await runCli(['api', 'GET', '/admin/dashboard'], { baseUrl: mock.baseUrl, env: { CH_CONFIG_DIR: tempConfigDir() } })
  assert.equal(res.code, 3)
  assert.match(JSON.parse(res.stdout).error.hint, /ch login/)
})

test('cli：--pretty 渲染表格到 stdout', async (t) => {
  const mock = await withServer(t, () => ({ status: 200, json: { code: 200, data: [{ id: 1, name: '张三' }, { id: 2, name: '李四' }] } }))
  const res = await runCli(['api', 'GET', '/any/list', '--pretty'], {
    baseUrl: mock.baseUrl,
    env: { CH_TOKEN: 't', CH_CONFIG_DIR: tempConfigDir() },
  })
  assert.equal(res.code, 0)
  assert.match(res.stdout, /id\s+name/)
  assert.match(res.stdout, /张三/)
  assert.doesNotMatch(res.stdout, /"ok"/)
})

test('cli：登录失败（HTTP 200 + code 401）→ AUTH_REJECTED 且提示限流', async (t) => {
  const mock = await withServer(t, () => ({ status: 200, json: { code: 401, message: '密码错误' } }))
  const res = await runCli(['login', '--studentNo', 'admin', '--password', 'wrong'], {
    baseUrl: mock.baseUrl,
    env: { CH_CONFIG_DIR: tempConfigDir() },
  })
  assert.equal(res.code, 3)
  const error = JSON.parse(res.stdout).error
  assert.equal(error.code, 'AUTH_REJECTED')
  assert.equal(error.message, '密码错误')
  assert.match(error.hint, /限流/)
})

test('cli：未知命令 → exit 2', async () => {
  const res = await runCli(['frobnicate', 'x'], { env: { CH_CONFIG_DIR: tempConfigDir() } })
  assert.equal(res.code, 2)
  assert.equal(JSON.parse(res.stdout).error.code, 'USAGE_ERROR')
})
