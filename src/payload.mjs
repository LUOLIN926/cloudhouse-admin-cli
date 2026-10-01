import { readFileSync } from 'node:fs'

import { usageError } from './errors.mjs'

/**
 * 写命令载荷构造。
 * 语义化 flag 提供基础字段；`-d/--data`（JSON 或 @file）整体覆盖/扩展，
 * 保证 Agent 对任意载荷字段有完全控制权（后端新增字段时 CLI 不落后）。
 */

/**
 * 取 `-d/--data` 的文本：`@path` 视为文件，其余视为字面量。
 * 文件读不到（ENOENT/EISDIR/权限）属于调用方写错了路径，必须是 exit 2，
 * 不能让它冒泡成 exit 1 的业务错误——Agent 会据此以为后端出了问题而重试。
 */
export function readDataText(raw, { label = '-d/--data' } = {}) {
  if (typeof raw !== 'string' || raw === '') {
    throw usageError(`${label} 需要一个 JSON 参数`, `可用 ${label} '{"k":1}' 或 ${label} @payload.json`)
  }
  if (!raw.startsWith('@')) return raw
  const file = raw.slice(1)
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    throw usageError(`${label} 指定的文件无法读取：${file}（${err.code || err.message}）`, '检查路径是否存在、是否为可读的文本文件')
  }
}

/** 解析 `-d/--data` 为任意 JSON 值（形状校验留给调用方） */
export function parseDataJson(raw, { label = '-d/--data' } = {}) {
  const text = readDataText(raw, { label })
  try {
    return JSON.parse(text)
  } catch (err) {
    throw usageError(`${label} 不是合法 JSON：${err.message}`, `可用 ${label} @payload.json 从文件读取`)
  }
}

export function payloadFrom(ctx, base = {}) {
  const raw = ctx.flags.get('data') ?? ctx.flags.get('d')
  if (raw === undefined || raw === '') return base
  const parsed = parseDataJson(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw usageError('-d/--data 必须是 JSON 对象')
  }
  return { ...base, ...parsed }
}

/** kebab-case flag → 驼峰字段名：flag 名与后端字段同名异形式，映射只写一处 */
export function camelCase(flag) {
  return flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * 逗号分隔的 id 列表 → 正整数数组。
 * `split(',').map(Number)` 会把 'abc' 变成 NaN、把空段变成 0，而 JSON.stringify(NaN)
 * 是 null：`--authorized-group-ids 1,abc,3` 实际发给后端的是 [1,null,3]，
 * `"2, ,3"` 则是 [2,0,3]——授权到一个不存在的组别，还一路 exit 0。
 */
export function parseIdList(raw, { flag = 'group-ids', max = 200 } = {}) {
  const parts = String(raw).split(',')
  if (parts.length > max) {
    throw usageError(`--${flag} 最多 ${max} 个（当前 ${parts.length} 个）`)
  }
  return parts.map((part) => {
    const text = part.trim()
    if (!/^\d+$/.test(text) || Number(text) < 1) {
      throw usageError(
        `--${flag} 含无效 id：${text === '' ? '（空段）' : text}`,
        `用逗号分隔的正整数，如 --${flag} 1,2,3；不要留空段或尾随逗号`,
      )
    }
    return Number(text)
  })
}

/** 读取字符串 flag；required 时缺失抛用法错误 */
export function flagString(ctx, name, { required = false, label } = {}) {
  const value = ctx.flags.get(name)
  if (typeof value !== 'string' || value === '') {
    if (required) {
      throw usageError(`缺少 --${name}`, label ? `用法：${label}` : undefined)
    }
    return undefined
  }
  return value
}

/** 读取数字 flag；required 时缺失抛用法错误，非数字抛用法错误 */
export function flagNumber(ctx, name, { required = false, label } = {}) {
  const value = ctx.flags.get(name)
  if (value === undefined || value === true || value === '') {
    if (required) throw usageError(`缺少 --${name}`, label ? `用法：${label}` : undefined)
    return undefined
  }
  const num = Number(value)
  if (!Number.isFinite(num)) throw usageError(`--${name} 不是有效数字：${value}`)
  return num
}

/** 读取枚举 flag；不在候列举内抛用法错误 */
export function flagEnum(ctx, name, choices, { required = false, label } = {}) {
  const value = flagString(ctx, name, { required, label })
  if (value === undefined) return undefined
  if (!choices.includes(value)) {
    throw usageError(`--${name} 必须是 ${choices.join(' / ')}之一（收到：${value}）`)
  }
  return value
}

/**
 * 布尔取值解析：true|false|1|0|yes|no（大小写不敏感），其余一律用法错误。
 * 之前有三套各自为政的解析（flagBool、candidates 内联、query.parseBool），
 * 语义都不同且都把不认识的写法当成 false：`ch candidates star 1 --starred yes`
 * 会提交 starred:false（与意图完全相反）并 exit 0。宁可直接报错。
 */
export function parseBoolFlag(value, { flag } = {}) {
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === '1' || text === 'yes' || text === 'y' || text === 'on') return true
  if (text === 'false' || text === '0' || text === 'no' || text === 'n' || text === 'off') return false
  const label = flag ? `--${flag}` : '布尔参数'
  throw usageError(`${label} 需要布尔取值（收到：${value}）`, '可用 true / false / 1 / 0 / yes / no')
}

/** 读取布尔 flag（--flag true|false，裸写视为 true，--no-flag 视为 false） */
export function flagBool(ctx, name) {
  const value = ctx.flags.get(name)
  if (value === undefined) return undefined
  if (value === true) return true
  if (value === false) return false
  return parseBoolFlag(value, { flag: name })
}

/** 布尔 flag 的存在性判定：`--show-token` / `--show-token=false` 都要给出正确答案 */
export function flagOn(ctx, name) {
  return flagBool(ctx, name) === true
}
