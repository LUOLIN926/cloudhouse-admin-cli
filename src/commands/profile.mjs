import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { flagString, flagNumber, payloadFrom } from '../payload.mjs'

register('profile get', {
  summary: '当前管理员个人资料',
  usage: 'ch profile get',
  endpoints: ['GET /admin/profile'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/profile' })
    return data
  },
})

register('profile update', {
  summary: '修改个人资料',
  usage: 'ch profile update --real-name 姓名 [--group-id N] [--phone 手机号]',
  endpoints: ['PUT /admin/profile'],
  run: async (ctx) => {
    const realName = flagString(ctx, 'real-name', { required: true, label: 'ch profile update --real-name 姓名' })
    const base = { realName }
    const groupId = flagNumber(ctx, 'group-id')
    if (groupId !== undefined) base.groupId = groupId
    const phone = flagString(ctx, 'phone')
    if (phone !== undefined) base.phone = phone
    const payload = payloadFrom(ctx, base)
    const { data } = await ctx.client.request({ method: 'PUT', path: '/admin/profile', body: payload })
    return data === null ? { updated: true } : data
  },
})

register('profile change-password', {
  summary: '修改当前账号登录密码',
  usage: 'ch profile change-password --password 新密码',
  endpoints: ['PUT /admin/profile/password'],
  run: async (ctx) => {
    const password = flagString(ctx, 'password', { required: true, label: 'ch profile change-password --password ******' })
    if (password.length < 6) throw usageError('密码长度不能少于 6 位')
    const payload = payloadFrom(ctx, { password })
    const { data } = await ctx.client.request({ method: 'PUT', path: '/admin/profile/password', body: payload })
    return data === null ? { updated: true } : data
  },
})
