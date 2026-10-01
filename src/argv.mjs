/**
 * argv 解析：位置参数 + --flag（支持 --flag=value / --flag value / --no-flag）。
 * 重复出现的 -q / -H / -d 等多值 flag 通过 multi 取值。
 */
import { BOOL_FLAGS } from './flags.mjs'

/** 布尔开关后面只有在跟的是布尔字面量时才把它当取值，否则 `ch --pretty dashboard` 会吃掉命令名 */
const BOOL_LITERALS = new Set(['true', 'false', '1', '0', 'yes', 'no'])

function nextIsValue(token, name) {
  if (token === undefined || token === '-' || token.startsWith('-')) return false
  return !BOOL_FLAGS.has(name) || BOOL_LITERALS.has(token.toLowerCase())
}

export function parseArgs(argv) {
  const positionals = []
  const flags = new Map()
  const multi = new Map()

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (token.startsWith('--')) {
      const body = token.slice(2)
      const eq = body.indexOf('=')
      let name = eq >= 0 ? body.slice(0, eq) : body
      let value
      if (eq >= 0) {
        value = body.slice(eq + 1)
      } else if (name.startsWith('no-')) {
        name = name.slice(3)
        value = false
      } else {
        value = nextIsValue(argv[i + 1], name) ? argv[++i] : true
      }
      flags.set(name, value)
      const bucket = multi.get(name) || []
      bucket.push(value)
      multi.set(name, bucket)
      continue
    }
    if (token.startsWith('-') && token.length > 1 && !/^-\d/.test(token)) {
      // 单字母短选项：-q value / -q=value / -qVALUE / -q（布尔）
      const shortMatch = token.match(/^-([A-Za-z])(?:=([\s\S]*))?$/)
      if (shortMatch) {
        const name = shortMatch[1]
        let value = shortMatch[2]
        if (value === undefined) {
          const next = argv[i + 1]
          if (next !== undefined && next !== '-' && !next.startsWith('-')) {
            value = next
            i += 1
          } else {
            value = true
          }
        }
        flags.set(name, value)
        const bucket = multi.get(name) || []
        bucket.push(value)
        multi.set(name, bucket)
        continue
      }
      // 其余按布尔簇处理（如 -abc）
      for (const ch of token.slice(1)) {
        flags.set(ch, true)
        const bucket = multi.get(ch) || []
        bucket.push(true)
        multi.set(ch, bucket)
      }
      continue
    }
    positionals.push(token)
  }

  return { positionals, flags, multi }
}

export function str(value) {
  return typeof value === 'string' ? value : undefined
}

export function toArray(value) {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}
