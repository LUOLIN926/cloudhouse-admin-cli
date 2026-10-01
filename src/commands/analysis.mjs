import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { register } from './index.mjs'
import { CliError, EXIT, usageError } from '../errors.mjs'
import { flagString, flagNumber, flagOn, parseDataJson, parseBoolFlag } from '../payload.mjs'
import { idParam } from '../path.mjs'
const resources = JSON.parse(fs.readFileSync(new URL('../analysis-resources.json', import.meta.url), 'utf8'))

const specs = new Map(resources.map(resource => [resource.name, resource]))
const requirement = 'backend v36 data-analysis permission (CLI 0.3.0)'
const read = { permission: 'data-analysis', backendRequirement: requirement }
function resource(ctx) {
  const name = ctx.positionals[0]
  if (!specs.has(name)) throw usageError('未知分析资源', '运行 ch analysis resources 查看资源目录')
  return name
}
function query(ctx, name) {
  const size = flagNumber(ctx, 'size') ?? 100
  if (!Number.isInteger(size) || size < 1 || size > 500) throw usageError('--size 须为 1–500 的整数')
  const raw = flagString(ctx, 'filters')
  const filters = raw === undefined ? {} : parseDataJson(raw, { label: '--filters' })
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) || Object.keys(filters).length > 16) throw usageError('--filters 必须是最多 16 个字段的对象')
  for (const [key, value] of Object.entries(filters)) {
    const declared = specs.get(name).filters
    const type = Object.hasOwn(declared, key) ? declared[key] : undefined
    if (!type || (type === 'integer' && (!Number.isSafeInteger(value) || value < 0)) ||
      (type === 'boolean' && typeof value !== 'boolean') ||
      (type === 'string' && (typeof value !== 'string' || value.length > 200))) throw usageError(`不适用的过滤字段或取值：${key}`)
  }
  const cursor = flagString(ctx, 'cursor')
  if (cursor && (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 2048)) throw usageError('--cursor 无效')
  return [['size', size], ['filters', JSON.stringify(filters)], ['cursor', cursor]]
}
function destination(ctx) {
  const out = path.resolve(flagString(ctx, 'out', { required: true }))
  try { if (!fs.statSync(path.dirname(out)).isDirectory()) throw Error() } catch { throw usageError('--out 父目录不存在') }
  if (fs.existsSync(out) && (!flagOn(ctx, 'force') || !fs.lstatSync(out).isFile())) throw usageError('目标已存在或不是普通文件；覆盖普通文件需 --force')
  return out
}
function publish(temp, out, force) {
  // link is atomic and refuses a race-created target. --force uses atomic replacement.
  if (force) fs.renameSync(temp, out)
  else { fs.linkSync(temp, out); fs.unlinkSync(temp) }
}
function responseError(message) { return new CliError({ code: 'UNEXPECTED_RESPONSE', message, exitCode: EXIT.BUSINESS }) }

register('analysis resources', {
  ...read, summary: '查询全量只读数据目录、字段、过滤条件及实际后端可用性', usage: 'ch analysis resources',
  endpoints: ['GET /admin/analysis/resources'],
  run: async ctx => (await ctx.client.request({ path: '/admin/analysis/resources' })).data,
})
register('analysis list', {
  ...read, summary: '按主键游标查询全量业务数据（不推进业务状态）',
  usage: 'ch analysis list <resource> [--cursor 游标] [--size 100] [--filters JSON或@文件]',
  endpoints: ['GET /admin/analysis/resources/{resource}'],
  run: async ctx => { const name = resource(ctx); return (await ctx.client.request({ path: `/admin/analysis/resources/${name}`, query: query(ctx, name) })).data },
})
register('analysis get', {
  ...read, summary: '读取单条分析记录，包括题目、答卷和评价（按字段白名单）',
  usage: 'ch analysis get <resource> <id>', endpoints: ['GET /admin/analysis/resources/{resource}/{id}'],
  run: async ctx => { const name = resource(ctx); const id = idParam(ctx.positionals[1]); if (BigInt(id) < 1n) throw usageError('id 须为正整数'); return (await ctx.client.request({ path: `/admin/analysis/resources/${name}/${id}` })).data },
})
register('analysis export', {
  ...read, localWrite: true, summary: '逐页导出 JSONL，全部成功后原子落盘；多页不是同一时刻快照',
  usage: 'ch analysis export <resource> --out ./data.jsonl [--size 100] [--filters JSON或@文件] [--force]',
  endpoints: ['GET /admin/analysis/resources/{resource}'],
  run: async ctx => {
    const name = resource(ctx), args = query(ctx, name), out = destination(ctx)
    const temp = `${out}.partial-${crypto.randomUUID()}`
    const fd = fs.openSync(temp, 'wx', 0o600)
    let count = 0, pages = 0, upperBound = null, cursor, last = 0n
    const seen = new Set()
    try {
      do {
        const { data } = await ctx.client.request({ path: `/admin/analysis/resources/${name}`, query: args.filter(([key]) => key !== 'cursor').concat([['cursor', cursor]]) })
        if (!data || data.resource !== name || !Array.isArray(data.items) || !/^\d+$/.test(String(data.upperBound)) ||
          (data.nextCursor !== null && (typeof data.nextCursor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(data.nextCursor)))) throw responseError('分析分页响应无效')
        if (upperBound !== null && upperBound !== data.upperBound) throw responseError('导出期间分页上界改变')
        upperBound = data.upperBound
        for (const row of data.items) {
          const id = String(row?.[specs.get(name).key])
          if (!/^\d+$/.test(id) || BigInt(id) <= last || BigInt(id) > BigInt(upperBound)) throw responseError('分析分页记录顺序或主键无效')
          last = BigInt(id); fs.writeSync(fd, JSON.stringify(row) + '\n'); count++
        }
        pages++; cursor = data.nextCursor
        if (cursor && (seen.has(cursor) || data.items.length === 0)) throw responseError('分析分页游标重复或没有进展')
        if (cursor) seen.add(cursor)
      } while (cursor)
      fs.fsyncSync(fd); fs.closeSync(fd); publish(temp, out, flagOn(ctx, 'force'))
    } catch (error) {
      try { fs.closeSync(fd) } catch {}
      try { fs.unlinkSync(temp) } catch {}
      throw error
    }
    return { savedTo: out, resource: name, records: count, pages, upperBound, consistency: 'bounded-live-read; not a transaction snapshot across pages' }
  },
})
register('analysis download', {
  ...read, localWrite: true, summary: '受鉴权下载分析附件到本地；不支持任意 URL 或服务器路径',
  usage: 'ch analysis download <attachmentId> --out ./attachment [--force]',
  endpoints: ['GET /admin/analysis/attachments/{attachmentId}'],
  run: async ctx => {
    const id = ctx.positionals[0]
    if (!/^(?:ai-[a-f0-9]{32}\.[a-z0-9]{2,5}|plan-[1-9]\d*-(?:assessment-file|assessment-image|pass-image|fail-image))$/.test(id ?? '')) throw usageError('attachmentId 无效，请使用分析记录中的 analysisAttachments.id')
    const out = destination(ctx)
    const { buffer, contentType } = await ctx.client.request({ path: `/admin/analysis/attachments/${id}`, raw: true })
    const temp = `${out}.partial-${crypto.randomUUID()}`
    try { fs.writeFileSync(temp, buffer, { flag: 'wx', mode: 0o600 }); publish(temp, out, flagOn(ctx, 'force')) }
    catch (error) { try { fs.unlinkSync(temp) } catch {}; throw error }
    return { savedTo: out, bytes: buffer.length, contentType }
  },
})
register('accounts analysis-permission', {
  permission: 'SYSTEM', backendRequirement: requirement, summary: 'SYSTEM 开启/关闭管理员数据分析权限（版本冲突须刷新）',
  usage: 'ch accounts analysis-permission <id> --enabled true|false --version N',
  endpoints: ['PUT /admin/accounts/{id}/data-analysis-permission'],
  run: async ctx => {
    const id = idParam(ctx.positionals[0]), enabled = parseBoolFlag(flagString(ctx, 'enabled', { required: true }), { flag: 'enabled' })
    const version = flagNumber(ctx, 'version', { required: true })
    if (!Number.isSafeInteger(version) || version < 0) throw usageError('--version 须为非负整数')
    return (await ctx.client.request({ method: 'PUT', path: `/admin/accounts/${id}/data-analysis-permission`, body: { enabled, version } })).data
  },
})
