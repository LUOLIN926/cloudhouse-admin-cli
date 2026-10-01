import { register } from './index.mjs'

register('dashboard', {
  summary: '招新总览统计（报名/录取/待处理/场次占用）',
  usage: 'ch dashboard [--pretty]',
  endpoints: ['GET /admin/dashboard'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/dashboard' })
    return data
  },
})
