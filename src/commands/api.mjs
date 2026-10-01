import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { toArray } from '../argv.mjs'
import { parseDataJson, flagOn } from '../payload.mjs'

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * 通用兜底：调用任意 API 端点。
 * 语义化命令未覆盖的长尾端点、新上线端点均可用它触达，保证 CLI 与后端能力同步。
 */
register('api', {
  summary: '通用兜底：调用任意 API 端点',
  usage: 'ch api <METHOD> <path> [-q key=value ...] [-d <json|@file>] [-H "Name: value" ...] [--public]',
  endpoints: [],
  // 逃生舱：未被 CLI 语义化的新端点参数也必须能发出去，所以跳过未知 flag 与 arity 检查
  permissiveFlags: true,
  run: async (ctx) => {
    const [methodRaw, requestPath] = ctx.positionals
    if (!methodRaw || !requestPath) {
      throw usageError('缺少 METHOD 或 path', '用法：ch api GET /admin/dashboard')
    }
    const method = String(methodRaw).toUpperCase()
    if (!METHODS.has(method)) {
      throw usageError(`不支持的 HTTP 方法：${methodRaw}`, `可用：${[...METHODS].join(' / ')}`)
    }

    const query = []
    for (const entry of toArray(ctx.multi.get('q'))) {
      const text = String(entry)
      const idx = text.indexOf('=')
      const key = idx >= 0 ? text.slice(0, idx) : text
      const value = idx >= 0 ? text.slice(idx + 1) : ''
      if (key) query.push([key, value])
    }

    const headers = {}
    for (const entry of toArray(ctx.multi.get('H'))) {
      const text = String(entry)
      const idx = text.indexOf(':')
      if (idx <= 0) throw usageError(`请求头格式应为 "Name: value"：${text}`)
      headers[text.slice(0, idx).trim()] = text.slice(idx + 1).trim()
    }

    let body
    const rawBody = ctx.flags.get('d')
    if (rawBody !== undefined && rawBody !== '') {
      body = parseDataJson(rawBody, { label: '-d' })
    }

    const { data } = await ctx.client.request({
      method,
      path: requestPath,
      query,
      body,
      headers,
      noAuth: flagOn(ctx, 'public'),
      // 逃生舱：允许把查询串直接写在 path 里（语义化命令不允许，见 client.mjs buildUrl）
      allowQuery: true,
    })
    return data
  },
})
