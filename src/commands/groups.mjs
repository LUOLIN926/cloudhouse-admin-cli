import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { flagString, payloadFrom } from '../payload.mjs'
import { idParam } from '../path.mjs'

const MAX_REQUIREMENT_LENGTH = 65

function groupPayload(ctx, { requireName }) {
  const base = {}
  const groupName = flagString(ctx, 'group-name', { required: requireName, label: 'ch groups create --group-name 名称' })
  if (groupName !== undefined) base.groupName = groupName
  const introduction = flagString(ctx, 'introduction')
  if (introduction !== undefined) base.introduction = introduction
  const requirement = flagString(ctx, 'requirement')
  if (requirement !== undefined) {
    if (requirement.length > MAX_REQUIREMENT_LENGTH) {
      throw usageError(`--requirement 不能超过 ${MAX_REQUIREMENT_LENGTH} 字（当前 ${requirement.length} 字）`)
    }
    base.requirement = requirement
  }
  return payloadFrom(ctx, base)
}

register('groups list', {
  summary: '组别列表',
  usage: 'ch groups list [--pretty]',
  endpoints: ['GET /groups'],
  run: async (ctx) => {
    const { data } = await ctx.client.request({ method: 'GET', path: '/groups' })
    return data
  },
})

register('groups create', {
  summary: '创建组别（SUPER/SYSTEM）',
  usage: 'ch groups create --group-name 名称 [--introduction 简介] [--requirement 要求≤65字]',
  endpoints: ['POST /groups'],
  run: async (ctx) => {
    const payload = groupPayload(ctx, { requireName: true })
    const { data } = await ctx.client.request({ method: 'POST', path: '/groups', body: payload })
    return data === null ? { created: true } : data
  },
})

register('groups update', {
  summary: '更新组别',
  usage: 'ch groups update <id> --group-name 名称 [--introduction 简介] [--requirement 要求≤65字]',
  endpoints: ['PUT /groups/{id}'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '组别 id' })
    const payload = groupPayload(ctx, { requireName: true })
    const { data } = await ctx.client.request({ method: 'PUT', path: `/groups/${id}`, body: payload })
    return data === null ? { updated: true, id: Number(id) } : data
  },
})

register('groups delete', {
  summary: '删除组别（SUPER/SYSTEM）',
  usage: 'ch groups delete <id>',
  endpoints: ['DELETE /groups/{id}'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '组别 id' })
    const { data } = await ctx.client.request({ method: 'DELETE', path: `/groups/${id}` })
    return data === null ? { deleted: true, id: Number(id) } : data
  },
})
