import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { flagString, flagNumber, flagBool, payloadFrom } from '../payload.mjs'
import { idParam } from '../path.mjs'

register('assistant search', {
  summary: '面试官工作台：按学号/姓名搜索候选人',
  usage: 'ch assistant search --keyword 张三',
  endpoints: ['GET /admin/assistant/search'],
  run: async (ctx) => {
    const keyword = flagString(ctx, 'keyword', { required: true, label: 'ch assistant search --keyword 张三' })
    const { data } = await ctx.client.request({
      method: 'GET',
      path: '/admin/assistant/search',
      query: [['keyword', keyword]],
    })
    return data
  },
})

register('assistant profile', {
  summary: '面试官工作台：候选人一屏档案（含全部场次与历史评价）',
  usage: 'ch assistant profile <userId>',
  endpoints: ['GET /admin/assistant/candidates/{userId}'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/admin/assistant/candidates/${userId}` })
    return data
  },
})

register('assistant submit', {
  summary: '面试官工作台：现场打分提交（结果+评语必填）',
  usage: 'ch assistant submit --interview-id N --result 1|2|3 --evaluation-content 评语 [--score 85] [--starred true|false]',
  endpoints: ['POST /admin/assistant/submit'],
  run: async (ctx) => {
    const interviewId = flagNumber(ctx, 'interview-id', { required: true, label: 'ch assistant submit --interview-id N' })
    const result = flagNumber(ctx, 'result', { required: true, label: 'ch assistant submit --result 1|2|3' })
    if (![1, 2, 3].includes(result)) throw usageError('--result 必须是 1|2|3')
    const evaluationContent = flagString(ctx, 'evaluation-content', { required: true, label: 'ch assistant submit --evaluation-content 评语' })
    const base = { interviewId, result, evaluationContent }
    const score = flagNumber(ctx, 'score')
    if (score !== undefined) {
      if (!Number.isInteger(score) || score < 0 || score > 100) throw usageError('--score 必须是 0-100 的整数')
      base.score = score
    }
    const starred = flagBool(ctx, 'starred')
    if (starred !== undefined) base.starred = starred
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/assistant/submit', body: payload })
    return data
  },
})
