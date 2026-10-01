import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { toArray } from '../argv.mjs'
import { flagString } from '../payload.mjs'

register('checkin launch', {
  summary: '创建签到大屏会话（8 小时有效，screenToken 仅经 header 传递，不落盘）',
  usage: 'ch checkin launch',
  endpoints: ['POST /admin/checkin-screens'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/checkin-screens' })
    return data
  },
})

register('checkin snapshot', {
  summary: '读取签到大屏当前快照（screenToken 经 X-Checkin-Screen-Token header，绝不携带管理员 JWT）',
  usage: 'ch checkin snapshot --screen-token <token> [--group-id N ...]',
  endpoints: ['GET /checkin-screens/current'],
  auth: false,
  run: async (ctx) => {
    const screenToken =
      flagString(ctx, 'screen-token') ||
      (typeof ctx.env.CH_CHECKIN_SCREEN_TOKEN === 'string' ? ctx.env.CH_CHECKIN_SCREEN_TOKEN.trim() : '')
    if (!screenToken) {
      throw usageError('缺少 --screen-token', '大屏 token 来自 ch checkin launch 的响应；仅经 header 传递，不写入任何持久化文件')
    }
    const query = []
    for (const entry of toArray(ctx.multi.get('group-id'))) {
      query.push(['groupId', String(entry)])
    }
    const { data } = await ctx.client.request({
      method: 'GET',
      path: '/checkin-screens/current',
      query,
      headers: { 'X-Checkin-Screen-Token': screenToken },
      noAuth: true,
    })
    return data
  },
})
