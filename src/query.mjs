/** 查询参数构造：flag → query key 的显式映射（与 api.ts 的参数名逐一对应） */
import { CliError, usageError } from './errors.mjs'

/**
 * @param {object} ctx CLI 上下文（flags）
 * @param {Record<string, {key?:string, parse?:(v:string)=>unknown}>} spec
 * @returns {Array<[string, unknown]>}
 */
export function collectQuery(ctx, spec) {
  const query = []
  for (const [flagName, options] of Object.entries(spec)) {
    const value = ctx.flags.get(flagName)
    if (value === undefined || value === true || value === false || value === '') continue
    const parse = options.parse || String
    let parsed
    try {
      parsed = parse(value)
    } catch (err) {
      // 解析器可能抛普通 Error（如内联转换）；本地校验失败一律归为用法错误（exit 2）
      if (err instanceof CliError) throw err
      throw usageError(`--${flagName} 取值无效：${err && err.message ? err.message : err}`)
    }
    query.push([options.key || flagName, parsed])
  }
  return query
}

export function parseNumber(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    throw usageError(`不是有效数字：${value}`, '数字型参数只接受纯数字，如 --page 2')
  }
  return num
}

/** 从 `-d/--data` 读取 JSON 载荷（支持 @file）；不存在返回 null */
export function readDataPayload(ctx) {
  const raw = ctx.flags.get('data') ?? ctx.flags.get('d')
  if (raw === undefined) return null
  if (raw === true) {
    throw usageError('-d/--data 需要一个 JSON 参数', '可用 -d \'{"k":1}\' 或 -d @payload.json')
  }
  return raw
}
