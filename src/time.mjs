/**
 * 时间处理。
 * - 传统接口：接受 `YYYY-MM-DD HH:mm:ss` 或 ISO，统一输出 `YYYY-MM-DDTHH:mm:ss`（Asia/Shanghai 无偏移，前端原样展示）
 * - AI Coding 接口：统一输出 `YYYY-MM-DDTHH:mm:ss+08:00`（对齐 admin-web toShanghaiIso）
 * Asia/Shanghai 自 1991 年起无夏令时，固定 UTC+8。
 */
import { usageError } from './errors.mjs'

const SHANGHAI_OFFSET_MINUTES = 8 * 60

function pad2(value) {
  return String(value).padStart(2, '0')
}

/**
 * Date.UTC 会把 13 月、45 日、99 时静默进位成「另一个合法时间」。
 * 归一化后把六个字段回读逐项比对，对不上就报用法错误——否则排出来的场次
 * 和调用方写的完全不是一回事，而且全程 exit 0。
 */
function assertWallClock(date, expected, input) {
  const p = shanghaiParts(date)
  const actual = [p.year, p.month, p.day, p.hour, p.minute, p.second]
  if (expected.some((want, i) => Number(actual[i]) !== Number(want))) {
    throw usageError(
      `时间字段超出范围：${input}（会被归一化成 ${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}）`,
      '月份 01-12、日 01-31、时 00-23、分与秒 00-59',
    )
  }
  return date
}

function parseAny(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw usageError('无效时间')
    return input
  }
  if (typeof input !== 'string') throw usageError('无效时间')
  const text = input.trim()
  if (!text) throw usageError('无效时间')
  // `YYYY-MM-DD HH:mm:ss`（无时区）按 Asia/Shanghai 解释
  const naive = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (naive) {
    const [, y, mo, d, h, mi, s = '0'] = naive
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - SHANGHAI_OFFSET_MINUTES / 60, Number(mi), Number(s)))
    return assertWallClock(date, [y, mo, d, h, mi, s], text)
  }
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, y, mo, d] = dateOnly
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), -SHANGHAI_OFFSET_MINUTES / 60))
    return assertWallClock(date, [y, mo, d, '0', '0', '0'], text)
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) throw usageError(`无效时间：${input}`)
  return parsed
}

function shanghaiParts(date) {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MINUTES * 60 * 1000)
  return {
    year: shifted.getUTCFullYear(),
    month: pad2(shifted.getUTCMonth() + 1),
    day: pad2(shifted.getUTCDate()),
    hour: pad2(shifted.getUTCHours()),
    minute: pad2(shifted.getUTCMinutes()),
    second: pad2(shifted.getUTCSeconds()),
  }
}

/** 传统接口时间：`YYYY-MM-DDTHH:mm:ss` */
export function normalizeLocalTime(input) {
  const date = parseAny(input)
  const p = shanghaiParts(date)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

/** AI Coding 接口时间：`YYYY-MM-DDTHH:mm:ss+08:00` */
export function toShanghaiOffset(input) {
  const date = parseAny(input)
  const p = shanghaiParts(date)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+08:00`
}

/** 解析 `YYYY-MM-DDTHH:mm:ss+08:00` 或本地无偏移时间为 epoch 毫秒（比较用） */
export function parseToEpochMillis(input) {
  return parseAny(input).getTime()
}
