import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { usageError } from './errors.mjs'

/** 内置 profile：优先级 flag > env > 配置文件 > 内置默认值 */
export const BUILTIN_PROFILES = Object.freeze({
  local: 'http://127.0.0.1:8080/api',
  prod: 'https://api.dayunwu.cn/api',
})
export const DEFAULT_PROFILE = 'local'

export function configDir(env = process.env) {
  return env.CH_CONFIG_DIR || path.join(os.homedir(), '.config', 'cloudhouse-cli')
}

export function configFilePath(env = process.env) {
  return path.join(configDir(env), 'config.json')
}

/** 读取用户配置文件（不存在或损坏时返回空对象，不阻断命令） */
export function loadConfigFile(env = process.env) {
  try {
    const raw = fs.readFileSync(configFilePath(env), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 解析运行配置。优先级：--flag > 环境变量 > 配置文件 > 内置默认。
 *
 * profile 拼错绝不能静默回落到 local：那会让一条以为在操作生产的写请求打到本地
 * （或反过来），而调用方看到的仍然是 exit 0。只有在 baseUrl 已由 flag/env 显式
 * 给出时，profile 才退化成一个标签；否则未知 profile 必须是用法错误。
 *
 * @returns {{profile:string, baseUrl:string, baseUrlSource:string}}
 */
export function resolveConfig({ flags = {}, env = process.env } = {}) {
  const file = loadConfigFile(env)
  const profile = String(flags.profile ?? env.CH_PROFILE ?? file.defaultProfile ?? DEFAULT_PROFILE)

  const flagBase = flags.baseUrl
  const envBase = env.CH_BASE_URL || env.CH_API_BASE
  const fileProfiles = file.profiles && typeof file.profiles === 'object' ? file.profiles : null
  const fileBase = fileProfiles ? fileProfiles[profile]?.baseUrl : undefined
  const builtinBase = BUILTIN_PROFILES[profile]
  const explicitBase = flagBase ?? envBase

  if (!builtinBase && !fileBase && !explicitBase) {
    const known = [...new Set([...Object.keys(BUILTIN_PROFILES), ...Object.keys(fileProfiles || {})])]
    throw usageError(`未知 profile：${profile}`, `已定义的环境：${known.join(' / ')}；也可用 --base-url 或 CH_BASE_URL 直接指定 API 根地址`)
  }

  const baseUrl = String(explicitBase ?? fileBase ?? builtinBase ?? BUILTIN_PROFILES[DEFAULT_PROFILE])
    .trim()
    .replace(/\/+$/, '')

  let baseUrlSource = 'builtin'
  if (flagBase) baseUrlSource = 'flag'
  else if (envBase) baseUrlSource = 'env'
  else if (fileBase) baseUrlSource = 'config-file'

  return { profile, baseUrl, baseUrlSource }
}
