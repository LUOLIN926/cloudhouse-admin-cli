import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getRegistry, renderHelp } from '../src/commands/index.mjs'
import { BOOL_FLAGS, VALUE_FLAGS } from '../src/flags.mjs'
import '../src/commands/load.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const DOC_DIR = path.join(__dirname, '..', 'docs')
const doc = (name) => fs.readFileSync(path.join(DOC_DIR, name), 'utf8')

const OVERVIEW = doc('00-overview.md')
const REFERENCE = doc('01-command-reference.md')
const CONTRACT = doc('02-agent-contract.md')

/** 长名在文档里以短形式书写的例外（api 兜底命令的 -d/-q/-H） */
const SHORT_FORM = new Map([['data', '-d'], ['d', '-d'], ['q', '-q'], ['H', '-H']])

test('文档：命令条数与注册表一致', () => {
  const declared = Number(OVERVIEW.match(/(\d+) 条命令/)[1])
  assert.equal(declared, getRegistry().size, 'docs/features/admin-cli/00-overview.md 的命令条数已漂移')
})

test('文档：每条注册命令都在命令参考里出现', () => {
  const missing = [...getRegistry().keys()].filter((name) => !REFERENCE.includes(`ch ${name}`))
  assert.deepEqual(missing, [], '这些命令未写入 01-command-reference.md')
})

test('文档：词表里每个 flag 都在命令参考里出现', () => {
  const undocumented = [...VALUE_FLAGS, ...BOOL_FLAGS].filter((name) => {
    if (REFERENCE.includes(`--${name}`)) return false
    const short = SHORT_FORM.get(name)
    return !(short && REFERENCE.includes(short))
  })
  assert.deepEqual(undocumented, [], '这些 flag 未写入 01-command-reference.md')
})

test('文档：敏感操作处数与 requireReason 调用点一致', () => {
  const dir = path.resolve(__dirname, '..', 'src', 'commands')
  const sites = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .reduce((sum, f) => sum + (fs.readFileSync(path.join(dir, f), 'utf8').match(/requireReason\(/g) || []).length, 0)
  const declared = Number(OVERVIEW.match(/共 (\d+) 处/)[1])
  assert.equal(declared, sites, '00-overview.md 的敏感写操作处数已漂移')
})

test('文档：--request-id 只声明在 ai 写命令上', () => {
  const marked = [...getRegistry().values()].filter((s) => s.requestId === true)
  assert.ok(marked.length > 0, '没有任何命令登记 requestId')
  for (const spec of marked) assert.ok(spec.name.startsWith('ai '), `${spec.name} 不应支持 --request-id`)
  assert.match(OVERVIEW, /只适用于 `ch ai \*` 的写命令/)
  assert.match(REFERENCE, /`--request-id` 只在 `ch ai \*` 写命令上有效/)
  assert.doesNotMatch(CONTRACT, /ch interviews result --request-id/, '契约文档里的重放示例会教 Agent 用死参数')
})

test('文档：退出码档位与契约表、help 输出一致', () => {
  const rows = [...CONTRACT.matchAll(/^\| (\d) \|.*$/gm)].map((m) => Number(m[1]))
  assert.deepEqual(rows, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], '02-agent-contract.md 的退出码表必须恰好覆盖 0–9')
  assert.match(OVERVIEW, /10 档语义化 exit code/)

  const help = renderHelp([]).text
  const block = help.slice(help.indexOf('退出码：'), help.indexOf('命令：'))
  const codes = [...block.matchAll(/(\d) [^\s]/g)].map((m) => Number(m[1]))
  assert.deepEqual(codes, rows, 'ch help 的退出码行与契约表不一致')
})

test('文档：help 列出全部全局选项', () => {
  const help = renderHelp([]).text
  for (const name of ['pretty', 'json', 'no-pretty', 'profile', 'base-url', 'timeout', 'out', 'force', 'allow-profile-mismatch', 'help']) {
    assert.ok(help.includes(`--${name}`), `ch help 缺少全局选项 --${name}`)
  }
})

test('文档：不再手写会漂移的用例数', () => {
  assert.doesNotMatch(OVERVIEW + REFERENCE + CONTRACT, /\d+ ?(个用例|条用例|tests\b)/, '用例数应由测试核对，不要手写')
})
