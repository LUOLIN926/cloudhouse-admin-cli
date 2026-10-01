import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'

/**
 * 退出码契约矩阵（docs/features/admin-cli/02-agent-contract.md 的「按 exit code 分支」前提）。
 * Agent 不解析中文文案，只看 exit code + 信封 code 字段，所以这一组的价值在于：
 * 本地就能判定的错误必须是 2，绝不能伪装成后端业务错误（1）让调用方去重试。
 */

const TOKEN = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
const ENV = { CH_TOKEN: TOKEN, CH_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ch-exit-')) }
/** 未登录场景：只隔离配置目录，避免读到开发机上的真实会话 */
const NO_TOKEN_ENV = { CH_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ch-exit-anon-')) }

async function captureServer(t, seen) {
  const mock = await startMockServer((req) => {
    seen.push({ method: req.method, path: req.path, query: req.query, headers: req.headers, body: req.body })
    return { status: 200, json: { code: 200, data: { ok: true } } }
  })
  t.after(() => mock.close())
  return mock
}

function envelope(stdout) {
  return JSON.parse(stdout)
}

test('exit 2：查询参数不是数字（未登录时也必须先报用法错）', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const withToken = await runCli(['candidates', 'list', '--page', 'abc'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(withToken.code, 2)
  assert.equal(envelope(withToken.stdout).error.code, 'USAGE_ERROR')
  assert.match(envelope(withToken.stdout).error.message, /不是有效数字/)
  assert.equal(seen.length, 0, '本地校验失败不得发出请求')

  // 鉴权检查惰性化后，同一条命令在未登录时仍然暴露 --page 的问题，而不是被 exit 3 掩盖
  const anon = await runCli(['candidates', 'list', '--page', 'abc'], { baseUrl: mock.baseUrl, env: NO_TOKEN_ENV })
  assert.equal(anon.code, 2, '用法错误必须先于未登录错误')
  assert.equal(envelope(anon.stdout).error.code, 'USAGE_ERROR')
})

test('exit 2：数字型查询参数逐个校验', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  for (const argv of [
    ['interviews', 'list', '--round', 'x'],
    ['slots', 'list', '--plan-id', '1.5.5'],
    ['candidates', 'list', '--starred-admin-id', 'abc'],
    ['plans', 'list', '--status', 'NaN'],
  ]) {
    const res = await runCli(argv, { baseUrl: mock.baseUrl, env: ENV })
    assert.equal(res.code, 2, `${argv.join(' ')} → ${res.stdout}`)
    assert.equal(envelope(res.stdout).error.code, 'USAGE_ERROR')
  }
  assert.equal(seen.length, 0)
})

test('exit 2：-d 指向的读不到的文件属于用法错误', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const missing = await runCli(['candidates', 'update', '1', '-d', '@/nope/missing.json'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(missing.code, 2)
  assert.equal(envelope(missing.stdout).error.code, 'USAGE_ERROR')
  assert.match(envelope(missing.stdout).error.message, /ENOENT/)

  const dir = await runCli(['candidates', 'update', '1', '-d', '@/tmp'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(dir.code, 2, '目录同样属于用法错误')

  const escapeHatch = await runCli(['api', 'POST', '/admin/dashboard', '-d', '@/nope/missing.json'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(escapeHatch.code, 2)
  assert.equal(envelope(escapeHatch.stdout).error.code, 'USAGE_ERROR')

  assert.equal(seen.length, 0)
})

test('exit 2：-d 非法 JSON 与数组载荷', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const bad = await runCli(['candidates', 'update', '1', '-d', '{not json'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(bad.code, 2)
  assert.match(envelope(bad.stdout).error.message, /不是合法 JSON/)

  const arr = await runCli(['candidates', 'update', '1', '-d', '[1,2]'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(arr.code, 2)
  assert.match(envelope(arr.stdout).error.message, /必须是 JSON 对象/)

  // 逃生舱允许任意 JSON 形状（后端有些端点收数组），只有语义化命令限制为对象
  assert.equal((await runCli(['api', 'POST', '/admin/x', '-d', '[1,2]'], { baseUrl: mock.baseUrl, env: ENV })).code, 0)
  assert.equal(seen.at(-1).body[0], 1)
})

test('exit 2：非法枚举在本地拦截', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(['interviews', 'result', '55', '--result', '9'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 2)
  assert.match(envelope(res.stdout).error.message, /必须是 1/)
  assert.equal(seen.length, 0)
})

test('未登录且参数合法 → 仍是 exit 3（惰性鉴权没有放松）', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(['candidates', 'list', '--page', '2'], { baseUrl: mock.baseUrl, env: NO_TOKEN_ENV })
  assert.equal(res.code, 3)
  assert.equal(envelope(res.stdout).error.code, 'NOT_LOGGED_IN')
  assert.equal(seen.length, 0, '未登录不应把请求发出去')
})

test('公开端点不带 token 时照常请求（auth:false / --public 不受惰性鉴权影响）', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(['api', 'GET', '/public/ping', '--public'], { baseUrl: mock.baseUrl, env: NO_TOKEN_ENV })
  assert.equal(res.code, 0, res.stdout)
  assert.equal(seen.length, 1)
  assert.ok(!seen[0].headers.authorization, '公开端点不应带出 Authorization')
})

test('exit 2：未知 profile 不再静默回落到 local', async () => {
  // 不给 --base-url / CH_BASE_URL：此时 profile 决定实际去向，拼错必须当场失败
  const res = await runCli(['--profile', 'staging', 'dashboard'], { env: ENV })
  assert.equal(res.code, 2, res.stdout)
  assert.match(envelope(res.stdout).error.message, /未知 profile：staging/)
})

test('exit 2：非 AI 写命令上的 --request-id 明确拒绝，而不是静默丢弃', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  // 02-agent-contract.md 曾给出 `ch interviews result --request-id` 的重放示例，
  // 但后端只有 aicoding 读 requestId：静默丢弃等于把「重复录入」的风险藏起来。
  for (const argv of [
    ['interviews', 'result', '55', '--result', '1', '--request-id', 'rid-1'],
    ['candidates', 'update', '1', '--request-id', 'rid-1'],
    ['notifications', 'create', '--title', 't', '--content', 'c', '--scope-type', 'ALL', '--request-id', 'rid-1'],
  ]) {
    const res = await runCli(argv, { baseUrl: mock.baseUrl, env: ENV })
    assert.equal(res.code, 2, `${argv.join(' ')} → ${res.stdout}`)
    assert.match(envelope(res.stdout).error.message, /只被 ch ai \* 的写操作支持/)
  }
  assert.equal(seen.length, 0)
})

test('exit 2：无法识别的布尔取值不再按 false 处理', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const typo = await runCli(['candidates', 'star', '1', '--starred', 'maybe'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(typo.code, 2, typo.stdout)
  assert.equal(envelope(typo.stdout).error.code, 'USAGE_ERROR')
  assert.match(envelope(typo.stdout).error.message, /需要布尔取值/)

  // 修复前：`--starred yes` 静默提交 starred:false（与意图相反）并 exit 0
  assert.equal((await runCli(['candidates', 'star', '1', '--starred', 'yes'], { baseUrl: mock.baseUrl, env: ENV })).code, 0)
  assert.deepEqual(seen.at(-1).body, { starred: true })
  assert.equal((await runCli(['candidates', 'star', '1', '--starred', 'no'], { baseUrl: mock.baseUrl, env: ENV })).code, 0)
  assert.deepEqual(seen.at(-1).body, { starred: false })

  // 查询串里的布尔保持字符串形状（后端 @RequestParam Boolean 认 "true"/"false"）
  await runCli(['candidates', 'list', '--starred', 'yes', '--starred-by-me', 'no'], { baseUrl: mock.baseUrl, env: ENV })
  const query = Object.fromEntries(seen.at(-1).query)
  assert.equal(query.starred, 'true')
  assert.equal(query.starredByMe, 'false')
})

test('exit 2：--help 指向具体命令，查不到的目标不再 exit 0', async (t) => {
  const mock = await captureServer(t, [])

  const cmdHelp = await runCli(['candidates', 'list', '--help'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(cmdHelp.code, 0, cmdHelp.stdout)
  assert.match(cmdHelp.stdout, /candidates list —/)
  assert.match(cmdHelp.stdout, /--third-round-choice-state/)

  const groupHelp = await runCli(['help', 'candidates'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(groupHelp.code, 0, groupHelp.stdout)
  assert.match(groupHelp.stdout, /candidates star/)

  const missing = await runCli(['help', 'badcmd'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(missing.code, 2, missing.stdout)
  assert.match(missing.stdout, /未找到命令：badcmd/)
})

test('--public / --show-token 的 false 取值不再被当成开启', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(['api', 'GET', '/admin/dashboard', '--public=false'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 0, res.stdout)
  assert.equal(seen.at(-1).headers.authorization, `Bearer ${TOKEN}`, '--public=false 必须仍然带鉴权头')
})

test('exit 2：组别 id 列表不再把 NaN/空段发给后端', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  // 修复前：Number('abc')=NaN → JSON.stringify 成 null；Number('')=0 → 授权到组别 0
  for (const argv of [
    ['accounts', 'create', '--studentNo', '2026000001', '--password', 'secret1', '--admin-level', 'REGULAR', '--authorized-group-ids', '1,abc,3'],
    ['accounts', 'batch', '--count', '2', '--password', 'secret1', '--admin-level', 'REGULAR', '--authorized-group-ids', '2, ,3'],
    ['accounts', 'update', '7', '--authorized-group-ids', '1,'],
    ['candidates', 'set-second-round-groups', '42', '--group-ids', '1,0'],
  ]) {
    const res = await runCli(argv, { baseUrl: mock.baseUrl, env: ENV })
    assert.equal(res.code, 2, `${argv.join(' ')} → ${res.stdout}`)
    assert.equal(envelope(res.stdout).error.code, 'USAGE_ERROR')
  }
  assert.equal(seen.length, 0)

  // 合法写法照常提交，且是数字数组（传统端点要 Long）
  await runCli(['accounts', 'update', '7', '--authorized-group-ids', '1, 2 ,3'], { baseUrl: mock.baseUrl, env: ENV })
  assert.deepEqual(seen.at(-1).body.authorizedGroupIds, [1, 2, 3])

  // AI Coding 端点要的是字符串数组（AiCodingValidation.ids() 拒收非 textual 元素）
  await runCli(['ai', 'plans', 'create', '--name', 'n', '--group-ids', '1,2'], { baseUrl: mock.baseUrl, env: ENV })
  assert.deepEqual(seen.at(-1).body.groupIds, ['1', '2'])
  const aiBlank = await runCli(['ai', 'plans', 'create', '--name', 'n', '--group-ids', '1,,3'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(aiBlank.code, 2, aiBlank.stdout)
  assert.match(envelope(aiBlank.stdout).error.message, /空段/)
})

test('exit 2：notifications update 不给任何字段时不再发空写请求', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const res = await runCli(['notifications', 'update', '1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 2, res.stdout)
  assert.match(envelope(res.stdout).error.message, /至少提供一个修改字段/)
  assert.equal(seen.length, 0, '后端对每个字段都是「非空才 set」，全 null 的 body 等于一次什么都不改的写')

  await runCli(['notifications', 'update', '1', '--title', '新标题'], { baseUrl: mock.baseUrl, env: ENV })
  assert.deepEqual(seen.at(-1).body, { title: '新标题' }, '只带显式给出的字段，不再附带五个 null')
})

test('exit 2：可选 reason 也要受 200 字上限约束', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  // 后端把非字符串的 reason 归一化成 null，所以 --reason 为空仍属合法（省略该键）
  const absent = await runCli(['interviews', 'attendance', '55', '--status', 'ARRIVED', '--reason', ''], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(absent.code, 0, absent.stdout)
  assert.deepEqual(seen.at(-1).body, { status: 'ARRIVED' })

  const long = await runCli(['interviews', 'attendance', '55', '--status', 'ARRIVED', '--reason', 'x'.repeat(10000)], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(long.code, 2, long.stdout)
  assert.match(envelope(long.stdout).error.message, /不能超过 200 字/)

  const ok = await runCli(['interviews', 'attendance', '55', '--status', 'LATE', '--reason', '  现场迟到 12 分钟  '], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(ok.code, 0, ok.stdout)
  assert.deepEqual(seen.at(-1).body, { status: 'LATE', reason: '现场迟到 12 分钟' })
})

test('exit 2：越界时间不再被静默进位成别的时间', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const base = ['slots', 'create', '--plan-id', '1', '--location', 'A301', '--capacity', '5']
  for (const bad of ['2026-13-45 99:00', '2026-02-30 25:61', '2026-00-01 00:00', '2026-09-28 24:00']) {
    const res = await runCli([...base, '--slot-time', bad], { baseUrl: mock.baseUrl, env: ENV })
    assert.equal(res.code, 2, `${bad} → ${res.stdout}`)
    assert.match(envelope(res.stdout).error.message, /时间字段超出范围/)
  }
  assert.equal(seen.length, 0, '修复前 2026-13-45 99:00 会被归一化成 2027-02-18T03:00:00 并成功创建')

  await runCli([...base, '--slot-time', '2026-09-28 14:00'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen.at(-1).body.slotTime, '2026-09-28T14:00:00')
  await runCli([...base, '--slot-time', '2026-09-28'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen.at(-1).body.slotTime, '2026-09-28T00:00:00')
})

test('exit 2：路径参数不再把请求改形', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  // 修复前：发出 /users/42?foo=bar/info —— /info 被 new URL() 当成查询串的值
  const q = await runCli(['candidates', 'get', '42?foo=bar'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(q.code, 2, q.stdout)
  const spaced = await runCli(['slots', 'qr', '9 /close'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(spaced.code, 2, spaced.stdout)
  const traversal = await runCli(['candidates', 'get', '../../admin/accounts'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(traversal.code, 2, traversal.stdout)
  const nonNumeric = await runCli(['notifications', 'delete', 'abc'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(nonNumeric.code, 2, nonNumeric.stdout)
  assert.equal(seen.length, 0)

  // 逃生舱仍然允许把查询串直接写进 path
  await runCli(['api', 'GET', '/admin/dashboard?days=7'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(seen.at(-1).path, '/api/admin/dashboard')
  assert.equal(seen.at(-1).query.get('days'), '7')
})

test('exit 7：请求超时有独立 code，并提醒写操作结果未知', async (t) => {
  const mock = await startMockServer(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return { status: 200, json: { code: 200, data: null } }
  })
  t.after(() => mock.close())

  const res = await runCli(['api', 'GET', '/admin/slow', '--timeout', '1000'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 7, res.stdout)
  const error = envelope(res.stdout).error
  assert.equal(error.code, 'NETWORK_TIMEOUT')
  assert.match(error.hint, /不要直接重放/)

  // 修复前没有 AbortSignal：后端 hang 住时 CLI 永久阻塞，Agent 无法按退出码分支
  const tooSmall = await runCli(['api', 'GET', '/admin/slow', '--timeout', '5'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(tooSmall.code, 2, tooSmall.stdout)
  assert.match(envelope(tooSmall.stdout).error.message, /1000 到 600000/)
})

test('exit 4：语义化命令遇到 HTTP 200 + code:403（后端权限拒绝的真实形状）', async (t) => {
  const mock = await startMockServer((req) => {
    if (req.path.startsWith('/api/admin/')) {
      return { status: 200, json: { code: 403, message: '无权查看全量候选人信息' } }
    }
    return { status: 200, json: { code: 200, data: null } }
  })
  t.after(() => mock.close())

  for (const argv of [['candidates', 'list'], ['dashboard'], ['accounts', 'list']]) {
    const res = await runCli(argv, { baseUrl: mock.baseUrl, env: ENV })
    assert.equal(res.code, 4, `${argv.join(' ')} → exit ${res.code}: ${res.stdout}`)
    const error = envelope(res.stdout).error
    assert.equal(error.code, 'PERMISSION_DENIED')
    assert.equal(error.httpStatus, 200, '必须保留 httpStatus，调用方才看得出这是业务码而非传输层 403')
    assert.match(error.hint, /ch whoami/)
  }
})
