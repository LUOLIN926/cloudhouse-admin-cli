import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery, parseNumber } from '../query.mjs'
import { flagEnum, flagString, flagNumber, payloadFrom } from '../payload.mjs'
import { requireReason } from '../sensitive.mjs'
import { idParam } from '../path.mjs'

const POSITIONS = ['CAPTAIN', 'LEADER', 'MEMBER']

register('applies list', {
  summary: '管理员申请审批列表',
  usage: 'ch applies list [--status 0|1|2] [--pretty]',
  endpoints: ['GET /admin/account-applications'],
  run: async (ctx) => {
    const query = collectQuery(ctx, { status: { parse: parseNumber } })
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/account-applications', query })
    return data
  },
})

register('applies pending-count', {
  summary: '未审批申请数量',
  usage: 'ch applies pending-count',
  endpoints: ['GET /admin/account-applications/pending-count'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/account-applications/pending-count' })
    return data
  },
})

register('applies approve', {
  summary: '审批通过（自动开通账号，账号=学号，初始密码=学号）',
  usage: 'ch applies approve <id>',
  endpoints: ['POST /admin/account-applications/{id}/approve'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '申请 id' })
    const { data } = await ctx.client.request({ method: 'POST', path: `/admin/account-applications/${id}/approve` })
    return data
  },
})

register('applies reject', {
  summary: '驳回申请（原因必填）',
  usage: 'ch applies reject <id> --reason 驳回原因',
  endpoints: ['POST /admin/account-applications/{id}/reject'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '申请 id' })
    const reason = requireReason(ctx, { label: 'ch applies reject <id> --reason 驳回原因' })
    const payload = payloadFrom(ctx, { reason })
    const { data } = await ctx.client.request({ method: 'POST', path: `/admin/account-applications/${id}/reject`, body: payload })
    return data === null ? { rejected: true, id: Number(id) } : data
  },
})

register('applies status', {
  summary: '按学号查询申请进度（公开接口，免登录）',
  usage: 'ch applies status <studentNo>',
  endpoints: ['GET /account-applications/status'],
  auth: false,
  run: async (ctx) => {
    const studentNo = idParam(ctx.positionals[0], { label: '学号' })
    const { data } = await ctx.client.request({
      method: 'GET',
      path: '/account-applications/status',
      query: [['studentNo', studentNo]],
      noAuth: true,
    })
    return data
  },
})

register('applies submit', {
  summary: '提交管理员账号申请（公开接口，免登录）',
  usage: 'ch applies submit --studentNo 10位学号 --real-name 姓名 --position-code CAPTAIN|LEADER|MEMBER [--apply-group-id N]',
  endpoints: ['POST /account-applications'],
  auth: false,
  run: async (ctx) => {
    const studentNo = flagString(ctx, 'studentNo', { required: true, label: 'ch applies submit --studentNo 2026000001' })
    if (!/^\d{10}$/.test(studentNo)) throw usageError('学号必须是 10 位数字')
    const realName = flagString(ctx, 'real-name', { required: true, label: 'ch applies submit --real-name 姓名' })
    const positionCode = flagEnum(ctx, 'position-code', POSITIONS, { required: true, label: `--position-code ${POSITIONS.join('|')}` })
    const base = { studentNo, realName, positionCode }
    const applyGroupId = flagNumber(ctx, 'apply-group-id')
    if (applyGroupId !== undefined) base.applyGroupId = applyGroupId
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({ method: 'POST', path: '/account-applications', body: payload, noAuth: true })
    return data
  },
})
