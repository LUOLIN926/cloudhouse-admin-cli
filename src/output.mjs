/**
 * 输出层：stdout 只承载稳定的 JSON 信封（Agent 契约），人类可读渲染走 --pretty。
 * stderr 只承载进度/提示，绝不混入 stdout。
 */

/** 递归排序对象键，保证 JSON 输出稳定可 diff */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key])
    return out
  }
  return value
}

export function stableStringify(value) {
  return JSON.stringify(sortKeys(value))
}

const WIDE_CHAR = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/

function displayWidth(text) {
  let width = 0
  for (const ch of String(text)) width += WIDE_CHAR.test(ch) ? 2 : 1
  return width
}

function truncate(text, maxWidth) {
  const s = String(text)
  if (displayWidth(s) <= maxWidth) return s
  let out = ''
  let width = 0
  for (const ch of s) {
    const w = WIDE_CHAR.test(ch) ? 2 : 1
    if (width + w > maxWidth - 1) break
    out += ch
    width += w
  }
  return `${out}…`
}

function pad(text, width) {
  const gap = width - displayWidth(text)
  return gap > 0 ? text + ' '.repeat(gap) : text
}

function scalarText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return truncate(stableStringify(value), 48)
  return truncate(value, 48)
}

function renderTable(rows, out) {
  if (rows.length === 0) {
    out.push('（无数据）')
    return
  }
  const columns = []
  const seen = new Set()
  for (const row of rows) {
    if (row && typeof row === 'object') {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key)
          columns.push(key)
        }
      }
    }
  }
  if (columns.length === 0) {
    for (const row of rows) out.push(scalarText(row))
    return
  }
  const widths = columns.map((key) => Math.max(displayWidth(key), ...rows.map((row) => displayWidth(scalarText(row && typeof row === 'object' ? row[key] : row)))))
  out.push(columns.map((key, i) => pad(key, widths[i])).join('  '))
  out.push(widths.map((w) => '─'.repeat(w)).join('  '))
  for (const row of rows) {
    out.push(columns.map((key, i) => pad(scalarText(row && typeof row === 'object' ? row[key] : row), widths[i])).join('  '))
  }
  out.push(`（共 ${rows.length} 行）`)
}

function renderValue(value, indent, out) {
  const padStr = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${padStr}（无数据）`)
      return
    }
    if (value.every((item) => item && typeof item === 'object')) {
      renderTable(value, out)
      return
    }
    for (const item of value) out.push(`${padStr}- ${scalarText(item)}`)
    return
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      out.push(`${padStr}（空对象）`)
      return
    }
    for (const [key, item] of entries) {
      if (item && typeof item === 'object') {
        out.push(`${padStr}${key}:`)
        renderValue(item, indent + 2, out)
      } else {
        out.push(`${padStr}${pad(`${key}:`, Math.max(12, ...entries.map(([k]) => displayWidth(k)) + 1))} ${scalarText(item)}`)
      }
    }
    return
  }
  out.push(`${padStr}${scalarText(value)}`)
}

/** --pretty 模式的人类可读渲染（表格/键值） */
export function renderPretty(value) {
  const out = []
  renderValue(value, 0, out)
  return out.join('\n')
}

/** 成功：stdout 输出信封 JSON 或 pretty 渲染（信封键序固定：ok → data；仅 data 负载递归排序保证稳定） */
export function printSuccess(stdout, data, { pretty = false } = {}) {
  if (pretty) {
    stdout.write(`${renderPretty(data)}\n`)
  } else {
    stdout.write(`${JSON.stringify({ ok: true, data: sortKeys(data) })}\n`)
  }
}

/** 失败：stdout 输出错误信封（保持 Agent 可解析），stderr 输出人读提示 */
export function printFailure(stdout, stderr, error) {
  const envelope = { ok: false, error: error.toJSON ? error.toJSON() : { code: 'UNKNOWN', message: String(error && error.message ? error.message : error) } }
  stdout.write(`${JSON.stringify(envelope)}\n`)
  if (error && error.hint) stderr.write(`提示：${error.hint}\n`)
}
