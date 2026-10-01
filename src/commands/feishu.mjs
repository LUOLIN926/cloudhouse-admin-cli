import { register } from './index.mjs'

register('feishu status', {
  summary: '飞书签到集成状态',
  usage: 'ch feishu status [--pretty]',
  endpoints: ['GET /admin/feishu/status'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/feishu/status' })
    return data
  },
})

register('feishu reconcile', {
  summary: '触发飞书场次双向对账',
  usage: 'ch feishu reconcile',
  endpoints: ['POST /admin/feishu/reconcile'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/feishu/reconcile' })
    return data === null ? { reconciled: true } : data
  },
})

register('feishu conflicts', {
  summary: '飞书同步冲突列表',
  usage: 'ch feishu conflicts [--pretty]',
  endpoints: ['GET /admin/feishu/conflicts'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/feishu/conflicts' })
    return data
  },
})
