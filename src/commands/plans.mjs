import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery, parseNumber } from '../query.mjs'
import { flagEnum, flagString, flagNumber, payloadFrom, camelCase } from '../payload.mjs'
import { normalizeLocalTime } from '../time.mjs'
import { idParam } from '../path.mjs'

/** buildPlanPayload 读取的 flag 清单（词表守护测试的扫描面，见文件内注释） */
const TEXT_FLAGS = ['assessment-image-url', 'assessment-file-url', 'assessment-file-name', 'pass-text-content', 'pass-image-url', 'fail-text-content', 'fail-image-url']
const BOOKING_TIME_FLAGS = ['booking-start-time', 'booking-end-time', 'publish-time']

register('plans list', {
  summary: '考核方案列表（一面/二轮/三面方案）',
  usage: 'ch plans list [--round 1|2|3] [--scope-group-id N] [--status 1|2] [--pretty]',
  endpoints: ['GET /admin/interview-plans'],
  run: async (ctx) => {
    const query = collectQuery(ctx, {
      round: { parse: parseNumber },
      'scope-group-id': { key: 'scopeGroupId', parse: parseNumber },
      status: { parse: parseNumber },
    })
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/interview-plans', query })
    return data
  },
})

/** 构造方案载荷：语义 flag 为基础，-d 覆盖；时间统一本地无偏移格式 */
function buildPlanPayload(ctx, { includeScope }) {
  const base = {}
  if (includeScope) {
    const round = flagEnum(ctx, 'round', ['1', '2', '3'], { required: true, label: 'ch plans create --round 1|2|3' })
    base.round = Number(round)
    base.scopeGroupId = flagNumber(ctx, 'scope-group-id', { required: true, label: 'ch plans create --scope-group-id N' })
  }
  const assessmentContent = flagString(ctx, 'assessment-content', { required: includeScope, label: '--assessment-content 考核内容' })
  if (assessmentContent !== undefined) base.assessmentContent = assessmentContent
  // 显式常量而非内联字面量：src/flags.mjs 的词表守护测试只认顶层读取与 *_FLAGS 常量，
  // 藏在 for-of 字面量里的 flag 名扫不到，就会退化成「拼错也不报」的静默丢失。
  for (const flag of TEXT_FLAGS) {
    const value = flagString(ctx, flag)
    if (value !== undefined) base[flag.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value
  }
  for (const flag of BOOKING_TIME_FLAGS) {
    const value = flagString(ctx, flag)
    if (value !== undefined) base[camelCase(flag)] = normalizeLocalTime(value)
  }
  const publishMode = flagEnum(ctx, 'publish-mode', ['REALTIME', 'SCHEDULED'])
  if (publishMode !== undefined) base.publishMode = publishMode
  const status = flagEnum(ctx, 'status', ['1', '2'])
  if (status !== undefined) base.status = Number(status)
  const payload = payloadFrom(ctx, base)
  if (payload.publishMode === 'SCHEDULED' && !payload.publishTime) {
    throw usageError('publishMode=SCHEDULED 时必须提供 --publish-time（或载荷中带 publishTime）')
  }
  return payload
}

register('plans create', {
  summary: '创建考核方案',
  usage: 'ch plans create --round 1|2|3 --scope-group-id N --assessment-content 内容 [--assessment-image-url U] [--assessment-file-url U] [--assessment-file-name 名] [--pass-text-content T] [--pass-image-url U] [--fail-text-content T] [--fail-image-url U] [--booking-start-time "2026-09-28 14:00"] [--booking-end-time "..."] [--publish-mode REALTIME|SCHEDULED] [--publish-time "..."] [-d json]',
  endpoints: ['POST /admin/interview-plans'],
  run: async (ctx) => {
    const payload = buildPlanPayload(ctx, { includeScope: true })
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/interview-plans', body: payload })
    return data
  },
})

register('plans update', {
  summary: '更新考核方案（未停用且无场次时可改）',
  usage: 'ch plans update <planId> [--assessment-content 内容] [--status 1|2] [--publish-mode ...] [--publish-time ...] [-d json]',
  endpoints: ['PUT /admin/interview-plans/{planId}'],
  run: async (ctx) => {
    const planId = idParam(ctx.positionals[0], { label: 'planId' })
    const payload = buildPlanPayload(ctx, { includeScope: false })
    const { data } = await ctx.client.request({ method: 'PUT', path: `/admin/interview-plans/${planId}`, body: payload })
    return data
  },
})

register('plans delete', {
  summary: '删除已停用且无场次的考核方案',
  usage: 'ch plans delete <planId>',
  endpoints: ['DELETE /admin/interview-plans/{planId}'],
  run: async (ctx) => {
    const planId = idParam(ctx.positionals[0], { label: 'planId' })
    const { data } = await ctx.client.request({ method: 'DELETE', path: `/admin/interview-plans/${planId}` })
    return data === null ? { deleted: true, planId: Number(planId) } : data
  },
})
