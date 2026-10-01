import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { loadSession, saveSession, clearSession, absorbRenewal, describeSessionDamage, sessionFilePath } from '../src/session.mjs'

function tempEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-test-'))
  return { CH_CONFIG_DIR: dir, dir }
}

test('session：保存后可读回，文件权限 0600', () => {
  const env = tempEnv()
  const file = saveSession(env, { token: 't1', userId: 1 })
  const loaded = loadSession(env)
  assert.equal(loaded.token, 't1')
  const mode = fs.statSync(file).mode & 0o777
  assert.equal(mode, 0o600)
  assert.equal(file, sessionFilePath(env))
})

test('session：文件缺失/损坏返回 null', () => {
  const env = tempEnv()
  assert.equal(loadSession(env), null)
  fs.writeFileSync(sessionFilePath(env), '{broken')
  assert.equal(loadSession(env), null)
})

test('session：absorbRenewal 仅在 token 匹配时换存', () => {
  const env = tempEnv()
  saveSession(env, { token: 'old-token', userId: 1 })
  assert.equal(absorbRenewal(env, 'other-token', 'new-token', 123), false)
  assert.equal(loadSession(env).token, 'old-token')
  assert.equal(absorbRenewal(env, 'old-token', 'new-token', 123), true)
  assert.equal(loadSession(env).token, 'new-token')
  assert.equal(loadSession(env).expiresAt, 123)
})

test('session：absorbRenewal 相同 token 不换存', () => {
  const env = tempEnv()
  saveSession(env, { token: 'same' })
  assert.equal(absorbRenewal(env, 'same', 'same', 1), false)
})

test('session：clearSession 可删可重复', () => {
  const env = tempEnv()
  saveSession(env, { token: 'x' })
  assert.equal(clearSession(env), true)
  assert.equal(clearSession(env), false)
  assert.equal(loadSession(env), null)
})

test('session：配置目录 0700，历史宽松权限会被收紧', () => {
  const env = tempEnv()
  const nested = { CH_CONFIG_DIR: path.join(env.dir, 'nested') }
  saveSession(nested, { token: 't1' })
  assert.equal(fs.statSync(nested.CH_CONFIG_DIR).mode & 0o777, 0o700, '此前新建目录是 0755，同机其它用户可读')

  const file = sessionFilePath(nested)
  fs.chmodSync(file, 0o644)
  saveSession(nested, { token: 't2' })
  // writeFileSync 的 mode 只在创建时生效，所以已存在的宽松权限必须显式 chmod 收回
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(loadSession(nested).token, 't2')
})

test('session：写入是原子的，不留临时文件', () => {
  const env = tempEnv()
  saveSession(env, { token: 'a' })
  saveSession(env, { token: 'b' })
  const leftovers = fs.readdirSync(env.dir).filter((f) => f.endsWith('.tmp'))
  assert.deepEqual(leftovers, [])
  assert.deepEqual(fs.readdirSync(env.dir), ['session.json'])
})

test('session：损坏文件可被问出来，但 loadSession 仍返回 null', () => {
  const env = tempEnv()
  assert.equal(describeSessionDamage(env), null, '不存在不算损坏')
  fs.writeFileSync(sessionFilePath(env), '{broken')
  assert.equal(loadSession(env), null)
  const damage = describeSessionDamage(env)
  assert.ok(damage, '损坏必须能被发现，否则用户看到的是「未登录」')
  assert.equal(damage.file, sessionFilePath(env))
  assert.match(damage.reason, /不是合法 JSON/)

  fs.writeFileSync(sessionFilePath(env), JSON.stringify({ userId: 1 }))
  assert.match(describeSessionDamage(env).reason, /没有 token/)

  saveSession(env, { token: 'ok' })
  assert.equal(describeSessionDamage(env), null)
})


test('session：旧可预测临时文件符号链接无法泄漏新 token', () => {
  const env = tempEnv()
  const outside = path.join(env.dir, 'outside.txt')
  fs.writeFileSync(outside, 'untouched')
  fs.symlinkSync(outside, `${sessionFilePath(env)}.${process.pid}.tmp`)
  saveSession(env, { token: 'new-private-test-token' })
  assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched')
  assert.equal(loadSession(env).token, 'new-private-test-token')
  assert.equal(fs.statSync(sessionFilePath(env)).mode & 0o777, 0o600)
})
