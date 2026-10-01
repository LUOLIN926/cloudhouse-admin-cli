import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'

const TOKEN = makeFakeToken(Math.floor(Date.now() / 1000) + 86400)
const ENV = { CH_TOKEN: TOKEN, CH_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ch-cli-')) }

async function captureServer(t, seen) {
  const mock = await startMockServer((req) => {
    seen.push({ method: req.method, path: req.path, query: req.query, headers: req.headers, body: req.body, rawBody: req.rawBody })
    return { status: 200, json: { code: 200, data: { ok: true } } }
  })
  t.after(() => mock.close())
  return mock
}

function last(seen) {
  return seen[seen.length - 1]
}

test('writes：interviews result / attendance / reschedule', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  await runCli(['interviews', 'result', '55', '--result', '2', '--remark', '表达清晰'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'PATCH')
  assert.equal(last(seen).path, '/api/admin/interviews/55/result')
  assert.deepEqual(last(seen).body, { result: 2, remark: '表达清晰' })

  await runCli(['interviews', 'attendance', '55', '--status', 'NO_SHOW'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'POST')
  assert.equal(last(seen).path, '/api/admin/interviews/55/attendance')
  assert.deepEqual(last(seen).body, { status: 'NO_SHOW' })

  await runCli(['interviews', 'reschedule', '55', '--slot', '102'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'PUT')
  assert.equal(last(seen).path, '/api/admin/interviews/55/slot')
  assert.deepEqual(last(seen).body, { slotId: 102 })
})

test('writes：interviews result 缺少 --result → exit 2', async () => {
  const res = await runCli(['interviews', 'result', '55'], { env: ENV, baseUrl: 'http://127.0.0.1:1/api' })
  assert.equal(res.code, 2)
})

test('writes：interviews batch-result 载荷本地校验', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const bad = await runCli(['interviews', 'batch-result', '-d', '{"round":1,"groupId":2,"results":[]}'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(bad.code, 2)

  const badItem = await runCli(
    ['interviews', 'batch-result', '-d', '{"round":1,"groupId":2,"results":[{"interviewId":11,"result":5}]}'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(badItem.code, 2)

  const ok = await runCli(
    ['interviews', 'batch-result', '-d', '{"round":1,"groupId":2,"results":[{"interviewId":11,"result":1}]}'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(ok.code, 0)
  assert.equal(last(seen).method, 'POST')
  assert.equal(last(seen).path, '/api/admin/interviews/batch-result')
})

test('writes：evaluations add 校验 score 区间', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const bad = await runCli(['evaluations', 'add', '9', '--content', '好', '--score', '120'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(bad.code, 2)

  await runCli(['evaluations', 'add', '9', '--content', '表现不错', '--score', '88'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/admin/interviews/9/evaluations')
  assert.deepEqual(last(seen).body, { content: '表现不错', score: 88 })
})

test('writes：plans create 必填校验 + 时间归一化', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const missing = await runCli(['plans', 'create', '--round', '1'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(missing.code, 2)

  const scheduledNoTime = await runCli(
    ['plans', 'create', '--round', '1', '--scope-group-id', '2', '--assessment-content', '内容', '--publish-mode', 'SCHEDULED'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(scheduledNoTime.code, 2)

  await runCli(
    [
      'plans', 'create',
      '--round', '1',
      '--scope-group-id', '2',
      '--assessment-content', '一面考核',
      '--booking-start-time', '2026-09-28 14:00',
      '--booking-end-time', '2026-09-28 18:30',
      '--publish-mode', 'SCHEDULED',
      '--publish-time', '2026-09-29 09:00',
    ],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(last(seen).path, '/api/admin/interview-plans')
  assert.deepEqual(last(seen).body, {
    round: 1,
    scopeGroupId: 2,
    assessmentContent: '一面考核',
    bookingStartTime: '2026-09-28T14:00:00',
    bookingEndTime: '2026-09-28T18:30:00',
    publishMode: 'SCHEDULED',
    publishTime: '2026-09-29T09:00:00',
  })

  // -d 可覆盖任意字段
  await runCli(
    ['plans', 'update', '7', '--assessment-content', '新内容', '-d', '{"status":2}'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(last(seen).method, 'PUT')
  assert.deepEqual(last(seen).body, { assessmentContent: '新内容', status: 2 })
})

test('writes：slots create 时间归一化与容量校验', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const badCapacity = await runCli(
    ['slots', 'create', '--plan-id', '1', '--slot-time', '2026-09-28 14:00', '--location', 'A301', '--capacity', '0'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(badCapacity.code, 2)

  await runCli(
    ['slots', 'create', '--plan-id', '1', '--slot-time', '2026-09-28 14:00', '--location', 'A301', '--capacity', '5'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.deepEqual(last(seen).body, { planId: 1, slotTime: '2026-09-28T14:00:00', location: 'A301', capacity: 5 })
})

test('writes：groups create requirement 65 字本地强校验', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const tooLong = await runCli(
    ['groups', 'create', '--group-name', '后端', '--requirement', '好'.repeat(66)],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(tooLong.code, 2)

  await runCli(['groups', 'create', '--group-name', '后端', '--requirement', '好'.repeat(65)], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).path, '/api/groups')
  assert.equal(last(seen).body.requirement.length, 65)
})

test('writes：notifications 载荷按 scope 置 null target', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const missingTarget = await runCli(
    ['notifications', 'create', '--title', 't', '--content', 'c', '--notice-level', 'INFO', '--scope-type', 'ROUND'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(missingTarget.code, 2)

  await runCli(
    ['notifications', 'create', '--title', '提醒', '--content', '带身份证', '--notice-level', 'URGENT', '--scope-type', 'ALL', '--start-time', '2026-09-28 08:00'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.deepEqual(last(seen).body, {
    title: '提醒',
    content: '带身份证',
    noticeLevel: 'URGENT',
    scopeType: 'ALL',
    targetRound: null,
    targetGroupId: null,
    targetSlotId: null,
    startTime: '2026-09-28T08:00:00',
    endTime: null,
  })

  await runCli(
    ['notifications', 'create', '--title', '组内通知', '--content', 'c', '--notice-level', 'INFO', '--scope-type', 'ROUND_GROUP', '--target-round', '2', '--target-group-id', '3'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.equal(last(seen).body.targetRound, 2)
  assert.equal(last(seen).body.targetGroupId, 3)

  await runCli(['notifications', 'status', '5', '--status', '2'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(last(seen).method, 'PATCH')
  assert.equal(last(seen).path, '/api/admin/notifications/5/status')
  assert.deepEqual(last(seen).body, { status: 2 })
})

test('uploads：下载落盘拒绝穿越 cwd 与静默覆盖', async (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ch-dl-')))
  let server
  try {
    server = await startMockServer((req) => {
      if (req.method === 'GET' && req.path.startsWith('/api/admin/ai-coding/paper-attachments/')) {
        return { status: 200, headers: { 'Content-Type': 'application/pdf' }, raw: Buffer.from('%PDF payload').toString('binary') }
      }
      return undefined
    })

    // 修复前：`--name ../../escaped.txt` 实测把远端内容写到 cwd 之外
    const escaped = await runCli(['uploads', 'attachment-download', '9', '--name', '../../escaped.pdf'], { baseUrl: server.baseUrl, env: ENV, cwd: dir })
    assert.equal(escaped.code, 0, escaped.stderr)
    assert.equal(JSON.parse(escaped.stdout).data.savedTo, path.join(dir, 'escaped.pdf'), '默认名必须 basename 化后落在 cwd 内')
    assert.ok(!fs.existsSync(path.resolve(dir, '..', '..', 'escaped.pdf')), '不得写到 cwd 之外')

    const dest = path.join(dir, 'spec.pdf')
    fs.writeFileSync(dest, '旧内容')
    const overwrite = await runCli(['uploads', 'attachment-download', '9', '--name', 'spec.pdf', '--out', dest], { baseUrl: server.baseUrl, env: ENV, cwd: dir })
    assert.equal(overwrite.code, 2, overwrite.stdout)
    assert.match(JSON.parse(overwrite.stdout).error.message, /已存在/)
    assert.equal(fs.readFileSync(dest, 'utf8'), '旧内容', '未加 --force 不能覆盖')

    const forced = await runCli(['uploads', 'attachment-download', '9', '--name', 'spec.pdf', '--out', dest, '--force'], { baseUrl: server.baseUrl, env: ENV, cwd: dir })
    assert.equal(forced.code, 0, forced.stderr)
    assert.equal(fs.readFileSync(dest, 'utf8'), '%PDF payload')
  } finally {
    if (server) await server.close()
  }
})

test('writes：assistant submit 载荷与校验', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)
  const bad = await runCli(['assistant', 'submit', '--interview-id', '1', '--result', '9', '--evaluation-content', 'x'], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(bad.code, 2)

  await runCli(
    ['assistant', 'submit', '--interview-id', '1', '--result', '1', '--evaluation-content', '很好', '--score', '90', '--starred', 'true'],
    { baseUrl: mock.baseUrl, env: ENV },
  )
  assert.deepEqual(last(seen).body, { interviewId: 1, result: 1, evaluationContent: '很好', score: 90, starred: true })
})

test('uploads：图片 multipart 上传与本地大小预检', async (t) => {
  const seen = []
  const mock = await captureServer(t, seen)

  const small = path.join(os.tmpdir(), 'ch-avatar.png')
  fs.writeFileSync(small, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))
  const res = await runCli(['uploads', 'image', small], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(res.code, 0, res.stderr)
  assert.match(last(seen).headers['content-type'], /^multipart\/form-data; boundary=/)
  assert.ok(last(seen).rawBody.includes('name="file"'), 'multipart 字段名必须是 file')
  assert.ok(last(seen).rawBody.includes('ch-avatar.png'), 'multipart 必须带文件名')
  const out = JSON.parse(res.stdout)
  assert.equal(out.data.fileName, 'ch-avatar.png')
  assert.equal(out.data.size, 11)

  const big = path.join(os.tmpdir(), 'ch-big.png')
  fs.writeFileSync(big, Buffer.alloc(2 * 1024 * 1024 + 1))
  const tooBig = await runCli(['uploads', 'image', big], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(tooBig.code, 2)
  assert.match(JSON.parse(tooBig.stdout).error.message, /2MB/)

  const wrongExt = path.join(os.tmpdir(), 'ch-note.txt')
  fs.writeFileSync(wrongExt, 'hello')
  const wrong = await runCli(['uploads', 'image', wrongExt], { baseUrl: mock.baseUrl, env: ENV })
  assert.equal(wrong.code, 2)
})

test('uploads：考核附件与二进制下载落盘', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-upload-'))
  const pdf = path.join(dir, 'spec.pdf')
  fs.writeFileSync(pdf, Buffer.from('%PDF-1.4 fake'))
  let server
  try {
    server = await startMockServer((req) => {
      if (req.method === 'POST' && req.path === '/api/admin/uploads/assessment-files') {
        return { status: 200, json: { code: 200, data: { url: '/uploads/spec.pdf', fileName: 'spec.pdf' } } }
      }
      if (req.method === 'GET' && req.path === '/api/admin/ai-coding/paper-attachments/9') {
        assert.equal(req.query.get('name'), 'spec.pdf')
        return { status: 200, headers: { 'Content-Type': 'application/pdf' }, raw: Buffer.from('%PDF-1.4 downloaded').toString('binary') }
      }
      return undefined
    })
    const up = await runCli(['uploads', 'assessment', pdf], { baseUrl: server.baseUrl, env: ENV })
    assert.equal(up.code, 0, up.stderr)
    assert.equal(JSON.parse(up.stdout).data.fileName, 'spec.pdf')
    assert.ok(JSON.parse(up.stdout).data.absoluteUrl.endsWith('/uploads/spec.pdf'))

    const out = path.join(dir, 'downloaded.pdf')
    const dl = await runCli(['uploads', 'attachment-download', '9', '--name', 'spec.pdf', '--out', out], { baseUrl: server.baseUrl, env: ENV })
    assert.equal(dl.code, 0, dl.stderr)
    assert.equal(fs.readFileSync(out, 'utf8'), '%PDF-1.4 downloaded')
    assert.equal(JSON.parse(dl.stdout).data.bytes, Buffer.byteLength('%PDF-1.4 downloaded'))
  } finally {
    if (server) await server.close()
  }
})
