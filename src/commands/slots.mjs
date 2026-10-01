import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery, parseNumber } from '../query.mjs'
import { flagEnum, flagString, flagNumber, payloadFrom } from '../payload.mjs'
import { normalizeLocalTime } from '../time.mjs'
import { idParam } from '../path.mjs'

register('slots list', {
  summary: '面试场次列表',
  usage: 'ch slots list [--round 1|2|3] [--scope-group-id N] [--plan-id N] [--status 1|2] [--pretty]',
  endpoints: ['GET /admin/interview-slots'],
  run: async (ctx) => {
    const query = collectQuery(ctx, {
      round: { parse: parseNumber },
      'scope-group-id': { key: 'scopeGroupId', parse: parseNumber },
      'plan-id': { key: 'planId', parse: parseNumber },
      status: { parse: parseNumber },
    })
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/interview-slots', query })
    return data
  },
})

register('slots qr', {
  summary: '场次签到二维码/口令',
  usage: 'ch slots qr <slotId>',
  endpoints: ['GET /admin/interview-slots/{slotId}/checkin-qr'],
  run: async (ctx) => {
    const slotId = idParam(ctx.positionals[0], { label: 'slotId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/admin/interview-slots/${slotId}/checkin-qr` })
    return data
  },
})

register('slots create', {
  summary: '创建面试场次',
  usage: 'ch slots create --plan-id N --slot-time "2026-09-28 14:00" --location 教学楼A301 --capacity 5',
  endpoints: ['POST /admin/interview-slots'],
  run: async (ctx) => {
    const planId = flagNumber(ctx, 'plan-id', { required: true, label: 'ch slots create --plan-id N' })
    const slotTime = flagString(ctx, 'slot-time', { required: true, label: 'ch slots create --slot-time "2026-09-28 14:00"' })
    const location = flagString(ctx, 'location', { required: true, label: 'ch slots create --location 地点' })
    const capacity = flagNumber(ctx, 'capacity', { required: true, label: 'ch slots create --capacity N' })
    if (!Number.isInteger(capacity) || capacity <= 0) throw usageError('--capacity 必须是正整数')
    const payload = payloadFrom(ctx, { planId, slotTime: normalizeLocalTime(slotTime), location, capacity })
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/interview-slots', body: payload })
    return data
  },
})

register('slots update', {
  summary: '更新面试场次',
  usage: 'ch slots update <slotId> [--slot-time "..."] [--location 地点] [--capacity N] [--status 1|2]',
  endpoints: ['PUT /admin/interview-slots/{slotId}'],
  run: async (ctx) => {
    const slotId = idParam(ctx.positionals[0], { label: 'slotId' })
    const base = {}
    const slotTime = flagString(ctx, 'slot-time')
    if (slotTime !== undefined) base.slotTime = normalizeLocalTime(slotTime)
    const location = flagString(ctx, 'location')
    if (location !== undefined) base.location = location
    const capacity = flagNumber(ctx, 'capacity')
    if (capacity !== undefined) {
      if (!Number.isInteger(capacity) || capacity <= 0) throw usageError('--capacity 必须是正整数')
      base.capacity = capacity
    }
    const status = flagEnum(ctx, 'status', ['1', '2'])
    if (status !== undefined) base.status = Number(status)
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({ method: 'PUT', path: `/admin/interview-slots/${slotId}`, body: payload })
    return data
  },
})

register('slots close', {
  summary: '关闭场次（停止预约）',
  usage: 'ch slots close <slotId>',
  endpoints: ['PUT /admin/interview-slots/{slotId}/close'],
  run: async (ctx) => {
    const slotId = idParam(ctx.positionals[0], { label: 'slotId' })
    const { data } = await ctx.client.request({ method: 'PUT', path: `/admin/interview-slots/${slotId}/close` })
    return data === null ? { closed: true, slotId: Number(slotId) } : data
  },
})

register('slots delete', {
  summary: '删除场次',
  usage: 'ch slots delete <slotId>',
  endpoints: ['DELETE /admin/interview-slots/{slotId}'],
  run: async (ctx) => {
    const slotId = idParam(ctx.positionals[0], { label: 'slotId' })
    const { data } = await ctx.client.request({ method: 'DELETE', path: `/admin/interview-slots/${slotId}` })
    return data === null ? { deleted: true, slotId: Number(slotId) } : data
  },
})
