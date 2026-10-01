import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { flagEnum, flagString, flagNumber, payloadFrom, parseIdList } from '../payload.mjs'
import { idParam } from '../path.mjs'

const ADMIN_LEVELS = ['SUPER', 'REGULAR', 'INTERVIEWER']

function validateStudentNo(studentNo) {
  if (!/^\d{10}$/.test(studentNo)) {
    throw usageError('学号必须是 10 位数字', '与招新系统学号规则一致')
  }
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw usageError('密码长度不能少于 6 位')
  }
}

register('accounts list', {
  summary: '管理员账号列表',
  usage: 'ch accounts list [--pretty]',
  endpoints: ['GET /admin/accounts'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/accounts' })
    return data
  },
})

register('accounts create', {
  summary: '创建分级管理员账号',
  usage: 'ch accounts create --studentNo 10位学号 --password 密码 [--real-name 姓名] --admin-level SUPER|REGULAR|INTERVIEWER [--authorized-group-ids 1,2]',
  endpoints: ['POST /admin/accounts'],
  run: async (ctx) => {
    const studentNo = flagString(ctx, 'studentNo', { required: true, label: 'ch accounts create --studentNo 2026000001' })
    validateStudentNo(studentNo)
    const password = flagString(ctx, 'password', { required: true, label: 'ch accounts create --password ******' })
    validatePassword(password)
    const adminLevel = flagEnum(ctx, 'admin-level', ADMIN_LEVELS, { required: true, label: `--admin-level ${ADMIN_LEVELS.join('|')}` })
    const base = { studentNo, password, adminLevel }
    const realName = flagString(ctx, 'real-name')
    if (realName !== undefined) base.realName = realName
    const groupIds = flagString(ctx, 'authorized-group-ids')
    if (groupIds !== undefined) base.authorizedGroupIds = parseIdList(groupIds, { flag: 'authorized-group-ids' })
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/accounts', body: payload })
    return data
  },
})

register('accounts batch', {
  summary: '批量创建同级别管理员账号',
  usage: 'ch accounts batch --count N --password 初始密码 --admin-level SUPER|REGULAR|INTERVIEWER [--authorized-group-ids 1,2]',
  endpoints: ['POST /admin/accounts/batch'],
  run: async (ctx) => {
    const count = flagNumber(ctx, 'count', { required: true, label: 'ch accounts batch --count 5' })
    if (!Number.isInteger(count) || count <= 0) throw usageError('--count 必须是正整数')
    const password = flagString(ctx, 'password', { required: true, label: 'ch accounts batch --password ******' })
    validatePassword(password)
    const adminLevel = flagEnum(ctx, 'admin-level', ADMIN_LEVELS, { required: true, label: `--admin-level ${ADMIN_LEVELS.join('|')}` })
    const base = { count, password, adminLevel }
    const groupIds = flagString(ctx, 'authorized-group-ids')
    if (groupIds !== undefined) base.authorizedGroupIds = parseIdList(groupIds, { flag: 'authorized-group-ids' })
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/accounts/batch', body: payload })
    return data
  },
})

register('accounts update', {
  summary: '修改管理员资料/级别/授权组别',
  usage: 'ch accounts update <id> [--real-name 姓名] [--admin-level SUPER|REGULAR|INTERVIEWER] [--authorized-group-ids 1,2]',
  endpoints: ['PUT /admin/accounts/{id}'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '管理员 id' })
    const base = {}
    const realName = flagString(ctx, 'real-name')
    if (realName !== undefined) base.realName = realName
    const adminLevel = flagEnum(ctx, 'admin-level', ADMIN_LEVELS)
    if (adminLevel !== undefined) base.adminLevel = adminLevel
    const groupIds = flagString(ctx, 'authorized-group-ids')
    if (groupIds !== undefined) base.authorizedGroupIds = parseIdList(groupIds, { flag: 'authorized-group-ids' })
    const payload = payloadFrom(ctx, base)
    if (Object.keys(payload).length === 0) {
      throw usageError('至少提供一个修改字段', '--real-name / --admin-level / --authorized-group-ids')
    }
    const { data } = await ctx.client.request({ method: 'PUT', path: `/admin/accounts/${id}`, body: payload })
    return data
  },
})

register('accounts reset-password', {
  summary: '重置管理员密码',
  usage: 'ch accounts reset-password <id> --password 新密码',
  endpoints: ['PUT /admin/accounts/{id}/password'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '管理员 id' })
    const password = flagString(ctx, 'password', { required: true, label: 'ch accounts reset-password <id> --password ******' })
    validatePassword(password)
    const payload = payloadFrom(ctx, { password })
    const { data } = await ctx.client.request({ method: 'PUT', path: `/admin/accounts/${id}/password`, body: payload })
    return data === null ? { reset: true, id: Number(id) } : data
  },
})

register('accounts delete', {
  summary: '删除管理员账号（初始管理员与自身由后端拒绝）',
  usage: 'ch accounts delete <id>',
  endpoints: ['DELETE /admin/accounts/{id}'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '管理员 id' })
    const { data } = await ctx.client.request({ method: 'DELETE', path: `/admin/accounts/${id}` })
    return data === null ? { deleted: true, id: Number(id) } : data
  },
})
