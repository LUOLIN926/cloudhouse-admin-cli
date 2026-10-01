import test from 'node:test'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'

import { stableStringify, renderPretty, printSuccess } from '../src/output.mjs'
import { runWithVersionRetry, isVersionConflict, isDefinitiveRejection, newRequestId } from '../src/idempotent.mjs'
import { CliError, EXIT } from '../src/errors.mjs'
import { normalizeLocalTime, toShanghaiOffset, parseToEpochMillis } from '../src/time.mjs'

function capture() {
  const chunks = []
  const stream = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk); cb() } })
  return { stream, text: () => Buffer.concat(chunks).toString('utf8') }
}

test('output：stableStringify 递归排序对象键', () => {
  const json = stableStringify({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })
  assert.equal(json, '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}')
})

test('output：printSuccess JSON 信封含 ok:true', () => {
  const out = capture()
  printSuccess(out.stream, { total: 1, records: [] }, { pretty: false })
  assert.equal(out.text(), '{"ok":true,"data":{"records":[],"total":1}}\n')
})

test('output：renderPretty 渲染对象数组为表格', () => {
  const text = renderPretty([{ id: 1, name: '张三' }, { id: 2, name: '李四' }])
  assert.match(text, /id\s+name/)
  assert.match(text, /张三/)
  assert.match(text, /共 2 行/)
})

test('output：renderPretty 渲染空数组', () => {
  assert.match(renderPretty([]), /无数据/)
})

test('time：normalizeLocalTime 输出无偏移本地格式', () => {
  assert.equal(normalizeLocalTime('2026-09-28 14:30:00'), '2026-09-28T14:30:00')
  assert.equal(normalizeLocalTime('2026-09-28T14:30:00'), '2026-09-28T14:30:00')
})

test('time：toShanghaiOffset 输出 +08:00（跨时区输入换算）', () => {
  assert.equal(toShanghaiOffset('2026-09-28 14:30:00'), '2026-09-28T14:30:00+08:00')
  assert.equal(toShanghaiOffset('2026-09-28T06:30:00Z'), '2026-09-28T14:30:00+08:00')
})

test('time：parseToEpochMillis 与上海时间一致', () => {
  assert.equal(parseToEpochMillis('2026-09-28 14:30:00'), parseToEpochMillis('2026-09-28T06:30:00Z'))
})

test('idempotent：显式 version 不自动重试', async () => {
  let calls = 0
  const run = async ({ requestId, version }) => {
    calls += 1
    assert.equal(version, 7)
    assert.match(requestId, /^[0-9a-f-]{36}$/)
    throw new CliError({ code: 'VERSION_CONFLICT', reasonCode: 'VERSION_CONFLICT', httpStatus: 409, message: 'conflict', payload: { currentVersion: 8 } })
  }
  await assert.rejects(
    () => runWithVersionRetry({ explicitVersion: 7, readVersion: async () => 0, run, log: () => {} }),
    (err) => isVersionConflict(err),
  )
  assert.equal(calls, 1)
})

test('idempotent：自读 version 冲突后重读重试，耗尽后抛出', async () => {
  const versions = [1, 2, 3]
  let reads = 0
  let calls = 0
  const run = async ({ version }) => {
    calls += 1
    const current = versions[reads - 1]
    if (version !== current) {
      throw new CliError({ code: 'VERSION_CONFLICT', reasonCode: 'VERSION_CONFLICT', httpStatus: 409, message: 'conflict', payload: { currentVersion: current } })
    }
    return { ok: true }
  }
  const result = await runWithVersionRetry({
    readVersion: async () => versions[reads++],
    run,
    maxRetries: 2,
    log: () => {},
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(calls, 1)

  // 永远冲突 → 重试耗尽
  reads = 0
  calls = 0
  await assert.rejects(
    () =>
      runWithVersionRetry({
        readVersion: async () => versions[reads++],
        run: async ({ version }) => {
          calls += 1
          throw new CliError({ code: 'VERSION_CONFLICT', reasonCode: 'VERSION_CONFLICT', httpStatus: 409, message: 'conflict', exitCode: EXIT.VERSION_CONFLICT, payload: { currentVersion: 99 } })
        },
        maxRetries: 2,
        log: () => {},
      }),
    (err) => isVersionConflict(err) && err.exitCode === EXIT.VERSION_CONFLICT,
  )
  assert.equal(calls, 3)
})

test('idempotent：newRequestId 每次不同', () => {
  assert.notEqual(newRequestId(), newRequestId())
})

test('idempotent：isDefinitiveRejection 排除 429 与 5xx', () => {
  assert.equal(isDefinitiveRejection(new CliError({ code: 'X', message: 'x', httpStatus: 400 })), true)
  assert.equal(isDefinitiveRejection(new CliError({ code: 'X', message: 'x', httpStatus: 429 })), false)
  assert.equal(isDefinitiveRejection(new CliError({ code: 'X', message: 'x', httpStatus: 500 })), false)
})
