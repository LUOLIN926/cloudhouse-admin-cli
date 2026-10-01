import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveConfig, BUILTIN_PROFILES } from '../src/config.mjs'

test('resolveConfig：默认 local profile 与内置地址', () => {
  const config = resolveConfig({ env: {} })
  assert.equal(config.profile, 'local')
  assert.equal(config.baseUrl, BUILTIN_PROFILES.local)
  assert.equal(config.baseUrlSource, 'builtin')
})

test('resolveConfig：flag > env > 配置文件 > 内置', () => {
  const env = { CH_PROFILE: 'prod', CH_BASE_URL: 'http://env.example/api/' }
  const withFlag = resolveConfig({ flags: { baseUrl: 'http://flag.example/api' }, env })
  assert.equal(withFlag.baseUrl, 'http://flag.example/api')
  assert.equal(withFlag.baseUrlSource, 'flag')

  const withEnv = resolveConfig({ env })
  assert.equal(withEnv.baseUrl, 'http://env.example/api')
  assert.equal(withEnv.baseUrlSource, 'env')
  assert.equal(withEnv.profile, 'prod')
})

test('resolveConfig：未知 profile 是用法错误，绝不静默回落 local', () => {
  // 这条用例此前断言的正是 bug：CH_PROFILE=staging 会静默打到 local 内置地址，
  // 于是「以为在操作生产、实际在操作本地」的写请求可以一路 exit 0。
  assert.throws(
    () => resolveConfig({ env: { CH_PROFILE: 'staging' } }),
    (err) => err.name === 'CliError' && err.exitCode === 2 && /未知 profile：staging/.test(err.message),
  )
  assert.throws(
    () => resolveConfig({ flags: { profile: 'prod-typo' }, env: {} }),
    (err) => err.exitCode === 2,
  )
})

test('resolveConfig：baseUrl 已显式给出时 profile 只是标签', () => {
  // --base-url / CH_BASE_URL 决定了实际去向，此时不认识的 profile 不该拦下请求，
  // 否则临时指向本地调试端口也会被误报成配置错误。
  const viaFlag = resolveConfig({ flags: { profile: 'staging', baseUrl: 'http://127.0.0.1:9999/api' }, env: {} })
  assert.equal(viaFlag.profile, 'staging')
  assert.equal(viaFlag.baseUrl, 'http://127.0.0.1:9999/api')
  assert.equal(viaFlag.baseUrlSource, 'flag')

  const viaEnv = resolveConfig({ env: { CH_PROFILE: 'staging', CH_BASE_URL: 'http://env.example/api' } })
  assert.equal(viaEnv.baseUrl, 'http://env.example/api')
})
