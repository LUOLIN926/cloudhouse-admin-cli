import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { flagString, flagNumber, payloadFrom } from '../payload.mjs'
import { idParam } from '../path.mjs'

register('evaluations add', {
  summary: '提交面试评价（评语必填，评分 0-100 整数选填）',
  usage: 'ch evaluations add <interviewId> --content 评语 [--score 85]',
  endpoints: ['POST /admin/interviews/{interviewId}/evaluations'],
  run: async (ctx) => {
    const interviewId = idParam(ctx.positionals[0], { label: 'interviewId' })
    const content = flagString(ctx, 'content', { required: true, label: 'ch evaluations add <interviewId> --content 评语' })
    const score = flagNumber(ctx, 'score')
    if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 100)) {
      throw usageError('--score 必须是 0-100 的整数')
    }
    const base = { content }
    if (score !== undefined) base.score = score
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({
      method: 'POST',
      path: `/admin/interviews/${interviewId}/evaluations`,
      body: payload,
    })
    return data
  },
})
