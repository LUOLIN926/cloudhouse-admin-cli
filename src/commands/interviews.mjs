import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery, parseNumber } from '../query.mjs'
import { flagEnum, flagString, flagNumber, payloadFrom } from '../payload.mjs'
import { optionalReason } from '../sensitive.mjs'
import { idParam } from '../path.mjs'

register('interviews list', {
  summary: '面试名单（按轮次/组别/场次/结果筛选）',
  usage: 'ch interviews list --round 1|2|3 [--group-id N] [--slot-id N] [--result 1|2|3] [--pretty]',
  endpoints: ['GET /admin/interviews'],
  run: async (ctx) => {
    const query = collectQuery(ctx, {
      round: { parse: parseNumber },
      'group-id': { key: 'groupId', parse: parseNumber },
      'slot-id': { key: 'slotId', parse: parseNumber },
      result: { parse: parseNumber },
    })
    if (!new Map(query).has('round')) {
      throw usageError('缺少 --round', '面试名单按轮次查询：ch interviews list --round 1')
    }
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/interviews', query })
    return data
  },
})

register('interviews search', {
  summary: '跨轮次搜索面试记录与面评关键词',
  usage: 'ch interviews search [--keyword 关键词] [--round N] [--group-id N] [--result 1|2|3] [--pretty]',
  endpoints: ['GET /admin/interviews/search'],
  run: async (ctx) => {
    const query = collectQuery(ctx, {
      keyword: {},
      round: { parse: parseNumber },
      'group-id': { key: 'groupId', parse: parseNumber },
      result: { parse: parseNumber },
    })
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/interviews/search', query })
    return data
  },
})

register('interviews statistics', {
  summary: '按轮次/组别的面试统计',
  usage: 'ch interviews statistics [--round N] [--group-id N] [--pretty]',
  endpoints: ['GET /admin/interviews/statistics'],
  run: async (ctx) => {
    const query = collectQuery(ctx, {
      round: { parse: parseNumber },
      'group-id': { key: 'groupId', parse: parseNumber },
    })
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/interviews/statistics', query })
    return data
  },
})

register('interviews reschedule-options', {
  summary: '管理员改约候选项（可改约的场次）',
  usage: 'ch interviews reschedule-options <interviewId>',
  endpoints: ['GET /admin/interviews/{interviewId}/reschedule-options'],
  run: async (ctx) => {
    const interviewId = idParam(ctx.positionals[0], { label: 'interviewId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/admin/interviews/${interviewId}/reschedule-options` })
    return data
  },
})

register('interviews result', {
  summary: '录入/修改单条面试结果',
  usage: 'ch interviews result <interviewId> --result 1|2|3 [--remark 备注]',
  endpoints: ['PATCH /admin/interviews/{interviewId}/result'],
  run: async (ctx) => {
    const interviewId = idParam(ctx.positionals[0], { label: 'interviewId' })
    const result = flagEnum(ctx, 'result', ['1', '2', '3'], { required: true, label: 'ch interviews result <interviewId> --result 1|2|3' })
    const remark = flagString(ctx, 'remark')
    const base = { result: Number(result) }
    if (remark !== undefined) base.remark = remark
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({
      method: 'PATCH',
      path: `/admin/interviews/${interviewId}/result`,
      body: payload,
    })
    return data
  },
})

const ATTENDANCE_STATUSES = ['ARRIVED', 'LATE', 'NO_SHOW', 'NOT_CHECKED_IN', 'CANCELLED']

register('interviews attendance', {
  summary: '补录/修正面试到场状态',
  usage: 'ch interviews attendance <interviewId> --status ARRIVED|LATE|NO_SHOW|NOT_CHECKED_IN|CANCELLED [--reason 原因]',
  endpoints: ['POST /admin/interviews/{interviewId}/attendance'],
  run: async (ctx) => {
    const interviewId = idParam(ctx.positionals[0], { label: 'interviewId' })
    const status = flagEnum(ctx, 'status', ATTENDANCE_STATUSES, { required: true, label: `--status ${ATTENDANCE_STATUSES.join('|')}` })
    const reason = optionalReason(ctx, { label: '--reason 到场状态修改原因（≤200 字，可省略）' })
    const base = { status }
    if (reason !== undefined) base.reason = reason
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({
      method: 'POST',
      path: `/admin/interviews/${interviewId}/attendance`,
      body: payload,
    })
    return data
  },
})

register('interviews reschedule', {
  summary: '管理员为候选人改约场次',
  usage: 'ch interviews reschedule <interviewId> --slot <slotId>',
  endpoints: ['PUT /admin/interviews/{interviewId}/slot'],
  run: async (ctx) => {
    const [interviewId] = ctx.positionals
    if (!interviewId) throw usageError('缺少 interviewId', '用法：ch interviews reschedule <interviewId> --slot 102')
    const slotId = flagNumber(ctx, 'slot', { required: true, label: 'ch interviews reschedule <interviewId> --slot <slotId>' })
    const payload = payloadFrom(ctx, { slotId })
    const { data } = await ctx.client.request({
      method: 'PUT',
      path: `/admin/interviews/${interviewId}/slot`,
      body: payload,
    })
    return data
  },
})

register('interviews batch-result', {
  summary: '批量录入面试结果',
  usage: 'ch interviews batch-result -d <json|@file>   # {"round":1,"groupId":2,"results":[{"interviewId":11,"result":1,"remark":"..."}]}',
  endpoints: ['POST /admin/interviews/batch-result'],
  run: async (ctx) => {
    const payload = payloadFrom(ctx, {})
    if (!Number.isFinite(Number(payload.round))) throw usageError('batch-result 载荷缺少数字字段 round')
    if (!Number.isFinite(Number(payload.groupId))) throw usageError('batch-result 载荷缺少数字字段 groupId')
    if (!Array.isArray(payload.results) || payload.results.length === 0) {
      throw usageError('batch-result 载荷的 results 必须是非空数组', '每项：{"interviewId":11,"result":1,"remark":"可选"}')
    }
    for (const item of payload.results) {
      if (!item || !Number.isFinite(Number(item.interviewId)) || ![1, 2, 3].includes(Number(item.result))) {
        throw usageError('results 每项必须包含数字 interviewId 与 result(1|2|3)')
      }
    }
    const { data } = await ctx.client.request({
      method: 'POST',
      path: '/admin/interviews/batch-result',
      body: payload,
    })
    return data
  },
})
