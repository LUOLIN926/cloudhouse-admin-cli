import readline from 'node:readline'
import { Writable } from 'node:stream'

/** TTY 普通输入；提示走 stderr，保留 stdout 的机器可读信封。 */
export function promptText(prompt) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true })
    rl.question(prompt, answer => { rl.close(); resolve(answer) })
    rl.on('SIGINT', () => { rl.close(); reject(new Error('已取消输入')) })
  })
}

/** 从 JWT payload 解码 exp（秒）→ epoch 毫秒；失败返回 null */
export function decodeTokenExpiry(token) {
  try {
    const parts = String(token).split('.')
    if (parts.length < 2) return null
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function sessionExpiryState(expiresAt, now = Date.now()) {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return 'unknown'
  const remaining = expiresAt - now
  if (remaining <= 0) return 'expired'
  if (remaining <= 15 * 60 * 1000) return 'expiring'
  return 'ok'
}

/** 交互式密码输入：readline 的输出被静音，不依赖平台的 stty。 */
export function promptPassword(prompt = '密码：', { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    const silent = new Writable({ write(_chunk, _encoding, callback) { callback() } })
    silent.isTTY = true
    silent.columns = output.columns || 80
    const rl = readline.createInterface({ input, output: silent, terminal: true })
    output.write(prompt)
    const finish = () => { rl.close(); silent.end(); output.write('\n') }
    rl.question('', answer => { finish(); resolve(answer) })
    rl.on('SIGINT', () => { finish(); reject(new Error('已取消输入')) })
  })
}
