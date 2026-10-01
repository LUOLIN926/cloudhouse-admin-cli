import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery, parseNumber } from '../query.mjs'
import { flagEnum, flagString, flagNumber, flagBool, payloadFrom, parseBoolFlag, parseIdList } from '../payload.mjs'
import { requireReason } from '../sensitive.mjs'
import { idParam } from '../path.mjs'
import { runWithVersionRetry } from '../idempotent.mjs'

register('candidates list', {
  summary: '候选人分页列表（后端过滤分页；全部筛选 AND）',
  usage: 'ch candidates list [--page N] [--size N] [--keyword 关键词] [--status 1|2|3] [--second-round-group-id N] [--third-round-group-id N] [--third-round-choice-state ALL|SELECTED|UNSELECTED] [--starred true|false] [--starred-admin-id N] [--starred-by-me true|false]',
  endpoints: ['GET /admin/users/info/page'],
  run: async (ctx) => {
    const query = collectQuery(ctx, {
      page: { parse: parseNumber },
      size: { parse: parseNumber },
      keyword: {},
      status: { parse: parseNumber },
      'second-round-group-id': { key: 'secondRoundGroupId', parse: parseNumber },
      'third-round-group-id': { key: 'thirdRoundGroupId', parse: parseNumber },
      'third-round-choice-state': { key: 'thirdRoundChoiceState' },
      starred: { parse: (v) => String(parseBoolFlag(v, { flag: 'starred' })) },
      'starred-admin-id': { key: 'starredAdminId', parse: parseNumber },
      'starred-by-me': { key: 'starredByMe', parse: (v) => String(parseBoolFlag(v, { flag: 'starred-by-me' })) },
    })
    const queryMap = new Map(query)
    if (!queryMap.has('page')) query.push(['page', 1])
    if (!queryMap.has('size')) query.push(['size', 20])
    if (!queryMap.has('thirdRoundChoiceState')) query.push(['thirdRoundChoiceState', 'ALL'])
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/users/info/page', query })
    return data
  },
})

register('candidates list-all', {
  summary: '候选人全量列表（旧接口，后端最多返回 200 条）',
  usage: 'ch candidates list-all [--pretty]',
  endpoints: ['GET /admin/users/info'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/users/info' })
    return data
  },
})

register('candidates get', {
  summary: '候选人档案详情',
  usage: 'ch candidates get <userId>',
  endpoints: ['GET /users/{userId}/info'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/users/${userId}/info` })
    return data
  },
})

register('candidates application', {
  summary: '候选人报名记录',
  usage: 'ch candidates application <userId>',
  endpoints: ['GET /users/{userId}/application'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/users/${userId}/application` })
    return data
  },
})

register('candidates interviews', {
  summary: '候选人的全部面试记录',
  usage: 'ch candidates interviews <userId>',
  endpoints: ['GET /users/{userId}/interviews'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/users/${userId}/interviews` })
    return data
  },
})

register('candidates evaluations', {
  summary: '候选人的全部面评',
  usage: 'ch candidates evaluations <userId>',
  endpoints: ['GET /admin/candidates/{userId}/evaluations'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/admin/candidates/${userId}/evaluations` })
    return data
  },
})

register('candidates starred-admins', {
  summary: '特别关注面试官列表（含打星统计）',
  usage: 'ch candidates starred-admins [--pretty]',
  endpoints: ['GET /admin/candidates/starred-admins'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/candidates/starred-admins' })
    return data
  },
})

register('candidates second-round-groups', {
  summary: '候选人二轮自选组别',
  usage: 'ch candidates second-round-groups <userId>',
  endpoints: ['GET /users/{userId}/second-round-groups'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/users/${userId}/second-round-groups` })
    return data
  },
})

register('candidates third-round-choice', {
  summary: '候选人三面选组上下文',
  usage: 'ch candidates third-round-choice <userId>',
  endpoints: ['GET /admin/users/{userId}/third-round-choice'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const { data } = await ctx.client.request({ method: 'GET', path: `/admin/users/${userId}/third-round-choice` })
    return data
  },
})

register('applications list', {
  summary: '报名记录分页列表',
  usage: 'ch applications list [--page N] [--size N]',
  endpoints: ['GET /admin/applications/page'],
  run: async (ctx) => {
    const query = collectQuery(ctx, { page: { parse: parseNumber }, size: { parse: parseNumber } })
    const queryMap = new Map(query)
    if (!queryMap.has('page')) query.push(['page', 1])
    if (!queryMap.has('size')) query.push(['size', 200])
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/applications/page', query })
    return data
  },
})

register('applications list-all', {
  summary: '报名记录全量列表（旧接口，后端最多返回 200 条）',
  usage: 'ch applications list-all [--pretty]',
  endpoints: ['GET /admin/applications'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/applications' })
    return data
  },
})

register('second-round-choices', {
  summary: '二轮考核组别自选全量列表',
  usage: 'ch second-round-choices [--pretty]',
  endpoints: ['GET /admin/second-round-choices'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/second-round-choices' })
    return data
  },
})

register('candidates set-third-round-choice', {
  summary: '修改候选人三面最终组别（原因必填；version 自动重读重试）',
  usage: 'ch candidates set-third-round-choice <userId> --group-id N --reason 原因 [--version N]',
  endpoints: ['PUT /admin/users/{userId}/third-round-choice'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const groupId = flagNumber(ctx, 'group-id', { required: true, label: '--group-id N' })
    const reason = requireReason(ctx, { label: '--reason 修改原因（≤200 字）' })
    const explicitVersion = flagNumber(ctx, 'version')
    const path = `/admin/users/${userId}/third-round-choice`

    return runWithVersionRetry({
      explicitVersion,
      readVersion: async () => {
        const { data } = await ctx.client.request({ method: 'GET', path })
        if (typeof data?.version !== 'number') {
          throw usageError('选组上下文中没有可用 version（候选人可能尚未进入三面阶段）')
        }
        return data.version
      },
      log: (message) => ctx.log(message),
      run: async ({ version }) => {
        const payload = payloadFrom(ctx, { groupId, reason, version })
        const { data } = await ctx.client.request({ method: 'PUT', path, body: payload })
        return data
      },
    })
  },
})

register('candidates star', {
  summary: '切换对候选人的特别关注标记',
  usage: 'ch candidates star <userId> --starred true|false',
  endpoints: ['POST /admin/candidates/{userId}/star'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const starred = flagBool(ctx, 'starred')
    if (starred === undefined) throw usageError('缺少 --starred', '用法：ch candidates star <userId> --starred true|false')
    const payload = payloadFrom(ctx, { starred })
    const { data } = await ctx.client.request({ method: 'POST', path: `/admin/candidates/${userId}/star`, body: payload })
    return data
  },
})

register('candidates update', {
  summary: '手动调整成员资料（仅更新传入字段）',
  usage: 'ch candidates update <userId> -d \'{"realName":"张三","phone":"138..."}\'',
  endpoints: ['PUT /users/{userId}/info'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const payload = payloadFrom(ctx, {})
    if (Object.keys(payload).length === 0) throw usageError('缺少更新字段', '用 -d \'{"字段":"值"}\' 提供')
    const { data } = await ctx.client.request({ method: 'PUT', path: `/users/${userId}/info`, body: payload })
    return data === null ? { updated: true, userId: Number(userId) } : data
  },
})

register('candidates application-status', {
  summary: '调整报名状态（仅未产生面试记录时可用）',
  usage: 'ch candidates application-status <userId> --status 1|2|3',
  endpoints: ['PATCH /admin/applications/{userId}/status'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const status = flagEnum(ctx, 'status', ['1', '2', '3'], { required: true, label: '--status 1|2|3' })
    const payload = payloadFrom(ctx, { status: Number(status) })
    const { data } = await ctx.client.request({ method: 'PATCH', path: `/admin/applications/${userId}/status`, body: payload })
    return data === null ? { updated: true, userId: Number(userId) } : data
  },
})

register('candidates set-second-round-groups', {
  summary: '设置候选人二轮考核组别',
  usage: 'ch candidates set-second-round-groups <userId> --group-ids 1,2',
  endpoints: ['PUT /users/{userId}/second-round-groups'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const base = payloadFrom(ctx, {})
    if (base.groupIds === undefined) {
      const raw = flagString(ctx, 'group-ids', { required: true, label: '--group-ids 1,2（或用 -d \'{"groupIds":[1,2]}\'）' })
      base.groupIds = parseIdList(raw, { flag: 'group-ids' })
    }
    const { data } = await ctx.client.request({ method: 'PUT', path: `/users/${userId}/second-round-groups`, body: base })
    return data === null ? { updated: true, userId: Number(userId) } : data
  },
})

register('candidates unbind-wechat', {
  summary: '解除候选人微信绑定（原因必填；后端同时失效其会话）',
  usage: 'ch candidates unbind-wechat <userId> --reason 原因',
  endpoints: ['DELETE /admin/users/{userId}/wechat-binding'],
  run: async (ctx) => {
    const userId = idParam(ctx.positionals[0], { label: 'userId' })
    const reason = requireReason(ctx, { label: '--reason 解绑原因（≤200 字）' })
    const payload = payloadFrom(ctx, { reason })
    const { data } = await ctx.client.request({ method: 'DELETE', path: `/admin/users/${userId}/wechat-binding`, body: payload })
    return data === null ? { unbound: true, userId: Number(userId) } : data
  },
})
