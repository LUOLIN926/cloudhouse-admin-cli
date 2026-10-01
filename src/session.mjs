import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { configDir } from './config.mjs'

const SESSION_FILE = 'session.json'

function sessionFilePath(env = process.env) {
  return path.join(configDir(env), SESSION_FILE)
}

/** 读取磁盘会话；文件不存在/损坏/无 token 时返回 null */
export function loadSession(env = process.env) {
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionFilePath(env), 'utf8'))
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 区分「没有会话」与「会话文件读不出来」。
 * loadSession 一律返回 null 是有意的（调用方要能继续走未登录分支，也有测试钉住它），
 * 但对用户来说「会话文件坏了」和「从没登录过」是完全不同的处置方式，
 * 所以坏掉时必须能问出来——否则表现是让人重新登录，而登录又会覆盖坏文件。
 * @returns {null | {file:string, reason:string}}
 */
export function describeSessionDamage(env = process.env) {
  const file = sessionFilePath(env)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    return err.code === 'ENOENT' ? null : { file, reason: `无法读取（${err.code || err.message}）` }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) return { file, reason: '文件里没有 token' }
    return null
  } catch (err) {
    return { file, reason: `不是合法 JSON（${err.message}）` }
  }
}

/**
 * 写入会话。
 * token 是敏感凭据：目录 0700、文件 0600，且必须先落临时文件再 rename——
 * 直接 writeFileSync 覆盖中途崩溃会留下截断的 JSON，而 loadSession 把截断读成 null，
 * 用户看到的是「未登录」而不是「会话坏了」。
 * fs.writeFileSync 的 mode 只在创建时生效，所以已存在 0644 的历史文件必须显式 chmod 收紧。
 */
export function saveSession(env, session) {
  const file = sessionFilePath(env)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  try {
    fs.chmodSync(path.dirname(file), 0o700)
  } catch {
    /* 目录属主不是自己时保持原样，不阻断命令 */
  }
  const tmp = `${file}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  try { fs.renameSync(tmp, file) }
  finally { try { fs.unlinkSync(tmp) } catch {} }
  return file
}

export function clearSession(env = process.env) {
  try {
    fs.unlinkSync(sessionFilePath(env))
    return true
  } catch {
    return false
  }
}

/**
 * 吸收后端滚动续期下发的新 Token（X-Renewed-Token / X-Token-Expires-At）。
 * 并发安全：仅当磁盘会话的 token 仍是本次请求发出的 token 时才换存，
 * 迟到的旧响应不能用旧续期结果覆盖更新的会话（与 admin-web absorbSessionRenewal 同语义）。
 * @returns {boolean} 是否发生了换存
 */
export function absorbRenewal(env, sentToken, renewedToken, expiresAtMs) {
  if (!sentToken || !renewedToken || renewedToken === sentToken) return false
  const current = loadSession(env)
  if (!current || current.token !== sentToken) return false
  const next = { ...current, token: renewedToken }
  if (Number.isFinite(expiresAtMs)) next.expiresAt = expiresAtMs
  saveSession(env, next)
  return true
}

export { sessionFilePath }
