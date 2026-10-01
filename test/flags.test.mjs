import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'
import { VALUE_FLAGS, BOOL_FLAGS, isKnownFlag, expectedPositionals } from '../src/flags.mjs'
import { parseArgs } from '../src/argv.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOKEN = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
const ENV = { CH_TOKEN: TOKEN, CH_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ch-flags-')) }

/* ============================ 词表与源码的一致性守护 ============================ */

/** 取出 head 之后紧跟的 {...} 块体（括号计数，避免正则跨行失控） */
function braceBody(src, openIndex) {
  let depth = 0
  for (let i = openIndex; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(openIndex + 1, i)
    }
  }
  return ''
}

/** 只取对象字面量的顶层键（嵌套对象里的 key 不算 flag） */
function topLevelKeys(body) {
  const keys = []
  let depth = 0
  let buf = ''
  const push = () => {
    const m = buf.match(/^\s*["']?([a-zA-Z0-9-]+)["']?\s*:$/)
    if (m) keys.push(m[1])
    buf = ''
  }
  for (const ch of body) {
    if (ch === '{' || ch === '[' || ch === '(') depth += 1
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      push()
      continue
    }
    if (ch === ':' && depth === 0) {
      buf += ch
      push()
      continue
    }
    if (ch !== '\n' && ch !== ',') buf += ch
    if (buf.length > 64) buf = buf.slice(-64)
  }
  push()
  return keys
}

function scanFile(src) {
  const value = new Set()
  const bool = new Set()
  for (const m of src.matchAll(/flag(?:String|Number|Enum)\(\s*ctx\s*,\s*'([a-zA-Z0-9-]+)'/g)) value.add(m[1])
  for (const m of src.matchAll(/flagBool\(\s*ctx\s*,\s*'([a-zA-Z0-9-]+)'/g)) bool.add(m[1])
  for (const m of src.matchAll(/flags\.get\('([a-zA-Z0-9-]+)'\)/g)) value.add(m[1])
  for (const m of src.matchAll(/multi\.get\('([a-zA-Z0-9-]+)'\)/g)) value.add(m[1])
  for (const m of src.matchAll(/flags\.has\('([a-zA-Z0-9-]+)'\)/g)) bool.add(m[1])
  if (/requireReason\(/.test(src)) value.add('reason')
  // 循环里的 flag 名必须写成 *_FLAGS 常量，内联字面量扫不到——这是刻意的约束
  for (const m of src.matchAll(/const [A-Z_]+_FLAGS\s*=\s*\[([^\]]*)\]/g)) {
    for (const q of m[1].matchAll(/'([a-zA-Z0-9-]+)'/g)) value.add(q[1])
  }
  for (const m of src.matchAll(/(?:collectQuery|listQuery)\(\s*ctx\s*,\s*\{/g)) {
    for (const k of topLevelKeys(braceBody(src, m.index + m[0].length - 1))) value.add(k)
  }
  return { value, bool }
}

/** src 下所有 .mjs（flags.mjs 自身是词表，不参与） */
function sourceNames() {
  const value = new Set()
  const bool = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'commands') continue
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.mjs') || entry.name === 'flags.mjs') continue
      const r = scanFile(fs.readFileSync(full, 'utf8'))
      for (const n of r.value) value.add(n)
      for (const n of r.bool) bool.add(n)
    }
  }
  walk(path.join(ROOT, 'src'))
  return { value, bool }
}

test('flags：源码读取的每个 flag 都已登记在词表里', () => {
  const { value, bool } = sourceNames()
  assert.ok(value.size >= 60, `扫描结果过小（${value.size}），说明扫描器失效了`)
  const missing = [...new Set([...value, ...bool])].filter((n) => !isKnownFlag(n)).sort()
  assert.deepEqual(missing, [], `这些 flag 在源码里被读取但未登记，拼错的同名 flag 将被静默忽略：${missing.join(' ')}`)
})

test('flags：词表里没有失效条目（每条都能在源码中找到读取点）', () => {
  const { value, bool } = sourceNames()
  const stale = [...VALUE_FLAGS].filter((n) => !value.has(n) && !bool.has(n)).sort()
  assert.deepEqual(stale, [], `词表登记了源码不再读取的 flag：${stale.join(' ')}`)
})

test('flags：取值型与开关型的归类不互相矛盾', () => {
  const overlap = [...BOOL_FLAGS].filter((n) => VALUE_FLAGS.has(n)).sort()
  assert.deepEqual(overlap, [], `同一 flag 既要求取值又允许裸写：${overlap.join(' ')}`)
})

test('flags：循环内不得内联字面量 flag 名', () => {
  // plans / notifications / ai 三处的 flag 循环已改为读取 *_FLAGS 常量；
  // 退回内联字面量会让上面的扫描漏掉名字，词表守护静默失效。
  for (const file of ['commands/plans.mjs', 'commands/notifications.mjs', 'commands/ai.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8')
    const inline = src.match(/for \(const (?:flag|\[flag, camel\]) of \[([^\]]*)\]/g) || []
    assert.deepEqual(inline, [], `${file} 里出现了内联 flag 数组，请改成 const XXX_FLAGS = [...]`)
  }
})

test('flags：每个模块调用的读取器都已导入（含 src 根目录）', () => {
  // 漏掉一个 import、或把 flagOn 写成 flagsOn，都不会让模块加载失败，只会在跑到那条
  // 路径时抛 ReferenceError，而入口把非 CliError 归为 exit 1 + code:"UNKNOWN"——
  // 等于把开发期错误当业务错误吐给 Agent。本次改动就踩过两次，所以守护覆盖 src 全部文件。
  const files = [
    ...fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.mjs')).map((f) => path.join(ROOT, 'src', f)),
    ...fs.readdirSync(path.join(ROOT, 'src/commands')).filter((f) => f.endsWith('.mjs')).map((f) => path.join(ROOT, 'src/commands', f)),
  ]
  for (const file of files) {
    if (path.basename(file) === 'flags.mjs') continue
    const src = fs.readFileSync(file, 'utf8')
    const used = new Set()
    for (const m of src.matchAll(/(?<![.\w])(flagString|flagNumber|flagEnum|flagBool|flagOn|payloadFrom|parseIdList|parseBoolFlag|camelCase|requireReason|optionalReason|collectQuery|parseNumber|readDataText|parseDataJson|idParam|textParam|describeSessionDamage)\s*\(/g)) used.add(m[1])
    const missing = [...used].filter((name) => !new RegExp(`import \\{[^}]*\\b${name}\\b`).test(src) && !new RegExp(`function ${name}\\(`).test(src))
    assert.deepEqual(missing, [], `${path.basename(file)} 调用了 ${missing.join(', ')} 却没有导入（或拼错）`)
  }
})

/* ============================ arity 与未知 flag 的实际行为 ============================ */

async function withMock(t, handler) {
  const mock = await startMockServer(handler)
  t.after(() => mock.close())
  return mock
}

test('arity：取值型 flag 缺值 → exit 2，且不发请求', async (t) => {
  const seen = []
  const mock = await withMock(t, (req) => {
    seen.push(req.path)
    return { status: 200, json: { code: 200, data: null } }
  })

  const res = await runCli(['candidates', 'list', '--keyword', '--page', '2'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 2, res.stdout)
  assert.match(JSON.parse(res.stdout).error.message, /--keyword 需要取值/)
  assert.deepEqual(seen, [], '本地就该拦下，不该把丢掉 keyword 的请求发出去')

  // 值以 - 开头同样按缺值处理，但 --flag=值 必须可用
  assert.equal((await runCli(['candidates', 'list', '--keyword', '-x'], { baseUrl: mock.baseUrl, env: ENV })).code, 2)
  assert.equal((await runCli(['candidates', 'list', '--keyword=-x'], { baseUrl: mock.baseUrl, env: ENV })).code, 0)
  assert.equal(seen.at(-1), '/api/admin/users/info/page')
})

test('arity：末尾裸写的取值型 flag 不再静默回落默认环境', async (t) => {
  const mock = await withMock(t, () => ({ status: 200, json: { code: 200, data: null } }))
  const res = await runCli(['dashboard', '--base-url'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 2, res.stdout)
  assert.match(JSON.parse(res.stdout).error.message, /--base-url 需要取值/)
})

test('arity：--flag 后紧跟 -- 之后的取值仍算取值', async (t) => {
  const seen = []
  const mock = await withMock(t, (req) => {
    seen.push(new URL(req.rawBody ? req.url : req.url, 'http://x').searchParams.get('keyword') ?? req.query.get('keyword'))
    return { status: 200, json: { code: 200, data: null } }
  })
  const res = await runCli(['candidates', 'list', '--keyword', '张三'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 0, res.stdout)
  assert.equal(seen.at(-1), '张三')
})

test('未知 flag：exit 2且不发请求', async (t) => {
  const seen = []
  const mock = await withMock(t, (req) => {
    seen.push({ path: req.path, query: [...req.query.entries()] })
    return { status: 200, json: { code: 200, data: null } }
  })
  const res = await runCli(['candidates', 'list', '--keywrod', '张三', '--sizes', '999'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 2, res.stdout)
  assert.match(res.stdout, /--keywrod/)
  assert.equal(seen.length, 0, '错误参数必须阻止请求')
})

test('多余位置参数：exit 2阻止请求', async (t) => {
  const mock = await withMock(t, () => ({ status: 200, json: { code: 200, data: { ok: true } } }))
  const res = await runCli(['dashboard', 'foo', 'bar'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 2, res.stdout)
  assert.match(res.stdout, /只使用 0 个位置参数/)
})

test('api 逃生舱不受 arity 与未知 flag 检查约束', async (t) => {
  const seen = []
  const mock = await withMock(t, (req) => {
    seen.push({ path: req.path, query: [...req.query.entries()] })
    return { status: 200, json: { code: 200, data: null } }
  })
  const res = await runCli(['api', 'GET', '/admin/whatever', '--newParam', '1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 0, res.stdout)
  assert.doesNotMatch(res.stderr, /未识别的 flag/)
})

/* ============================ 输出模式（P1-8） ============================ */

test('--no-pretty 在管道下必须输出 JSON，而不是人类表格', async (t) => {
  const mock = await withMock(t, () => ({ status: 200, json: { code: 200, data: [{ id: 1, name: '张三' }] } }))
  const res = await runCli(['--no-pretty', 'dashboard'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 0, res.stdout)
  const parsed = JSON.parse(res.stdout)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.data, [{ id: 1, name: '张三' }])

  const on = await runCli(['--pretty', 'dashboard'], { baseUrl: mock.baseUrl, env: ENV })
  assert.match(on.stdout, /张三/)
  assert.doesNotMatch(on.stdout, /"ok"/)

  // --json 是布尔开关，绝不能把后面的命令名吃成自己的取值
  const json = await runCli(['dashboard', '--json'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(json.code, 0, json.stdout)
  assert.equal(JSON.parse(json.stdout).ok, true)
})

test('parseArgs：--no-x 落 false、= 形式取原值、-- 之后全部是位置参数', () => {
  const { flags } = parseArgs(['--no-pretty', '--keyword=张三', '--', 'x', '--json'])
  assert.equal(flags.get('pretty'), false)
  assert.equal(flags.get('keyword'), '张三')
  assert.equal(expectedPositionals({ usage: 'ch api <METHOD> <path> [-q k=v]' }), 2)
  assert.equal(expectedPositionals({ usage: ['ch ai plans get <id>', 'ch ai plans list [--page N]'] }), 1)
})
