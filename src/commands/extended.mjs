import fs from 'node:fs'
import path from 'node:path'
import { register } from './index.mjs'
import { flagString, flagOn, flagNumber, payloadFrom } from '../payload.mjs'
import { idParam, textParam } from '../path.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery, parseNumber } from '../query.mjs'
import { runWithVersionRetry } from '../idempotent.mjs'

register('second-round-choices page', {
  summary: '分页查询二轮组别选择',
  usage: 'ch second-round-choices page [--page N] [--size N]',
  endpoints: ['GET /admin/second-round-choices/page'],
  run: async ctx => (await ctx.client.request({ path: '/admin/second-round-choices/page', query: collectQuery(ctx, { page: { parse: parseNumber }, size: { parse: parseNumber } }) })).data,
})
register('slots attendance', {
  summary: '查看场次到场名单', usage: 'ch slots attendance <slotId>',
  endpoints: ['GET /admin/interview-slots/{slotId}/attendance'],
  run: async ctx => (await ctx.client.request({ path: `/admin/interview-slots/${idParam(ctx.positionals[0])}/attendance` })).data,
})
for (const [name, summary, endpoint] of [
  ['feishu backfill-absence', '补推当天缺勤通知（会向真人发送通知，仅全局管理员）', '/admin/feishu/notifications/backfill-today-absence'],
  ['feishu refresh-document', '刷新飞书场次文档（外部写入，仅全局管理员）', '/admin/feishu/upcoming-slots-document/refresh'],
]) register(name, { summary, usage: `ch ${name}`, permission: 'global-admin', endpoints: [`POST ${endpoint}`], run: async ctx => (await ctx.client.request({ method: 'POST', path: endpoint })).data })
register('feishu deliveries', {
  summary: '查询飞书投递队列（最多200条，仅全局管理员）', usage: 'ch feishu deliveries [--status QUEUED|SENDING|SENT|FAILED|SKIPPED|RETRY]', permission: 'global-admin',
  endpoints: ['GET /admin/feishu/deliveries'],
  run: async ctx => (await ctx.client.request({ path: '/admin/feishu/deliveries', query: collectQuery(ctx, { status: {} }) })).data,
})
register('feishu requeue', {
  summary: '重放失败/跳过投递（可能向真人补发通知，仅全局管理员）', usage: 'ch feishu requeue [--ids 1,2] [--all]', permission: 'global-admin',
  endpoints: ['POST /admin/feishu/deliveries/requeue'],
  run: async ctx => {
    const raw = flagString(ctx, 'ids')
    const all = flagOn(ctx, 'all')
    if ((raw === undefined) === !all) throw usageError('必须且只能指定 --ids 1,2 或 --all，避免误重放全部队列')
    const ids = raw === undefined ? [] : raw.split(',').map(s => {
      if (!/^[1-9]\d*$/.test(s.trim()) || !Number.isSafeInteger(Number(s))) throw usageError('--ids 必须是逗号分隔的正整数')
      return Number(s)
    })
    return (await ctx.client.request({ method: 'POST', path: '/admin/feishu/deliveries/requeue', body: { ids } })).data
  },
})
const pending = 'material-authoring backend (not included in this CLI release)'
register('ai materials', {
  summary: '上传/预览出题资料（需新版后端；上传不支持requestId去重）', backendRequirement: pending,
  usage: 'ch ai materials upload <file>\nch ai materials get <materialId>',
  endpoints: ['POST /admin/ai-coding/materials', 'GET /admin/ai-coding/materials/{id}'],
  run: async ctx => {
    const [action, value] = ctx.positionals
    if (action === 'get') {
      if (!/^[a-f0-9]{32}\.(md|txt)$/.test(String(value))) throw usageError('materialId 必须是服务器返回的资料 id')
      return (await ctx.client.request({ path: `/admin/ai-coding/materials/${value}` })).data
    }
    if (action !== 'upload' || !value) throw usageError('用法：ch ai materials upload <file> 或 get <materialId>')
    const ext = path.extname(value).toLowerCase()
    if (!['.md', '.txt'].includes(ext)) throw usageError('资料仅支持 UTF-8 .md/.txt')
    let bytes
    try {
      const stat = fs.statSync(value)
      if (!stat.isFile() || stat.size === 0 || stat.size > 262144) throw usageError('资料须为非空文件，≤256 KiB')
      bytes = fs.readFileSync(value)
    } catch (err) { if (err.exitCode) throw err; throw usageError(`资料无法读取：${value}`) }
    let text
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw usageError('资料必须为 UTF-8 编码') }
    if (!text.trim() || text.includes('\0')) throw usageError('资料须为非空 UTF-8 文本且不能含 NUL')
    const formData = new FormData()
    formData.append('file', new Blob([bytes], { type: 'text/plain' }), path.basename(value))
    return (await ctx.client.request({ method: 'POST', path: '/admin/ai-coding/materials', formData })).data
  },
})
register('ai papers', {
  summary: '创建出题任务/查询任务/确认题目（需新版后端）', backendRequirement: pending, requestId: true,
  usage: 'ch ai papers generate <planId> <paperId> [--version N] [--request-id ID]\nch ai papers get-generation <planId> <paperId> <jobId>\nch ai papers confirm <planId> <paperId> [--version N] [--request-id ID]',
  endpoints: ['POST /admin/ai-coding/plans/{planId}/papers/{paperId}/generations', 'GET /admin/ai-coding/plans/{planId}/papers/{paperId}/generations/{jobId}', 'POST /admin/ai-coding/plans/{planId}/papers/{paperId}/confirm'],
  run: async ctx => {
    const [action, planRaw, paperRaw, jobRaw] = ctx.positionals
    if (!['generate', 'get-generation', 'confirm'].includes(action)) throw usageError('ai papers 子命令必须是 generate|get-generation|confirm')
    const planId = idParam(planRaw, { label: 'planId' })
    const paperId = textParam(paperRaw, { label: 'paperId' })
    const base = `/admin/ai-coding/plans/${planId}/papers/${paperId}`
    if (action === 'get-generation') return (await ctx.client.request({ path: `${base}/generations/${idParam(jobRaw, { label: 'jobId' })}` })).data
    const original = payloadFrom(ctx, {})
    const explicitVersion = flagNumber(ctx, 'version') ?? original.version
    if (explicitVersion !== undefined && (!Number.isSafeInteger(Number(explicitVersion)) || Number(explicitVersion) < 0)) throw usageError('version 必须是非负整数')
    return runWithVersionRetry({
      explicitVersion, explicitRequestId: flagString(ctx, 'request-id') || original.requestId, log: ctx.log,
      readVersion: async () => {
        const { data } = await ctx.client.request({ path: `/admin/ai-coding/plans/${planId}` })
        if (!Number.isSafeInteger(data?.version)) throw usageError('计划详情中缺少 version')
        return data.version
      },
      run: async ({ version, requestId }) => (await ctx.client.request({ method: 'POST', path: `${base}/${action === 'generate' ? 'generations' : 'confirm'}`, body: { ...original, version, requestId } })).data,
    })
  },
})
