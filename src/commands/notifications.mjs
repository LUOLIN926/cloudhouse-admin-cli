import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery } from '../query.mjs'
import { flagEnum, flagString, flagNumber, payloadFrom, camelCase } from '../payload.mjs'
import { normalizeLocalTime } from '../time.mjs'
import { idParam } from '../path.mjs'

const NOTICE_LEVELS = ['INFO', 'WARNING', 'URGENT']
const SCOPE_TYPES = ['ALL', 'ROUND', 'GROUP', 'ROUND_GROUP', 'SLOT']
/** 生效窗口两端；写成常量而非内联字面量，flag 词表守护测试才扫得到 */
const WINDOW_TIME_FLAGS = ['start-time', 'end-time']

/** scopeType 决定哪些 target 字段有意义；缺取值当场报错 */
function applyScopeTargets(ctx, base, scopeType) {
  if (scopeType === 'ROUND' || scopeType === 'ROUND_GROUP') {
    base.targetRound = flagNumber(ctx, 'target-round', { required: true, label: '--target-round N' })
  }
  if (scopeType === 'GROUP' || scopeType === 'ROUND_GROUP') {
    base.targetGroupId = flagNumber(ctx, 'target-group-id', { required: true, label: '--target-group-id N' })
  }
  if (scopeType === 'SLOT') {
    base.targetSlotId = flagNumber(ctx, 'target-slot-id', { required: true, label: '--target-slot-id N' })
  }
}

/**
 * 创建通知：未用到的 target / 时间显式置 null（INSERT 需要把这些列写成空值）。
 */
function createPayload(ctx) {
  const base = { targetRound: null, targetGroupId: null, targetSlotId: null }
  base.title = flagString(ctx, 'title', { required: true, label: 'ch notifications create --title 标题' })
  base.content = flagString(ctx, 'content', { required: true, label: 'ch notifications create --content 内容' })
  base.noticeLevel = flagEnum(ctx, 'notice-level', NOTICE_LEVELS, { required: true, label: `--notice-level ${NOTICE_LEVELS.join('|')}` })
  base.scopeType = flagEnum(ctx, 'scope-type', SCOPE_TYPES, { required: true, label: `--scope-type ${SCOPE_TYPES.join('|')}` })
  applyScopeTargets(ctx, base, base.scopeType)
  for (const flag of WINDOW_TIME_FLAGS) {
    const value = flagString(ctx, flag)
    base[camelCase(flag)] = value === undefined ? null : normalizeLocalTime(value)
  }
  const status = flagEnum(ctx, 'status', ['1', '2'])
  if (status !== undefined) base.status = Number(status)
  return payloadFrom(ctx, base)
}

/**
 * 编辑通知：只带显式给出的字段。
 * 后端 InterviewNotificationServiceImpl:179-200 对每个字段都是「非空才 set」，
 * 传 null 等于不传；所以旧写法无 flag 时发出的那五个 null 既清不掉任何东西，
 * 也不会更新任何列——一条纯粹的空写请求。
 */
function updatePayload(ctx) {
  const base = {}
  const title = flagString(ctx, 'title')
  if (title !== undefined) base.title = title
  const content = flagString(ctx, 'content')
  if (content !== undefined) base.content = content
  const noticeLevel = flagEnum(ctx, 'notice-level', NOTICE_LEVELS)
  if (noticeLevel !== undefined) base.noticeLevel = noticeLevel
  const scopeType = flagEnum(ctx, 'scope-type', SCOPE_TYPES)
  if (scopeType !== undefined) base.scopeType = scopeType
  applyScopeTargets(ctx, base, scopeType)
  for (const flag of WINDOW_TIME_FLAGS) {
    const value = flagString(ctx, flag)
    if (value !== undefined) base[camelCase(flag)] = normalizeLocalTime(value)
  }
  const status = flagEnum(ctx, 'status', ['1', '2'])
  if (status !== undefined) base.status = Number(status)
  const payload = payloadFrom(ctx, base)
  if (Object.keys(payload).length === 0) {
    throw usageError('至少提供一个修改字段', '--title / --content / --notice-level / --scope-type / --target-* / --start-time / --end-time / --status')
  }
  return payload
}

register('notifications list', {
  summary: '横幅通知列表',
  usage: 'ch notifications list [--scope-type ALL|ROUND|GROUP|ROUND_GROUP|SLOT] [--status 1|2] [--pretty]',
  endpoints: ['GET /admin/notifications'],
  run: async (ctx) => {
    const query = collectQuery(ctx, { 'scope-type': { key: 'scopeType' }, status: {} })
    const { data } = await ctx.client.request({ method: 'GET', path: '/admin/notifications', query })
    return data
  },
})

register('notifications create', {
  summary: '发布横幅通知',
  usage: 'ch notifications create --title 标题 --content 内容 --notice-level INFO|WARNING|URGENT --scope-type ALL|ROUND|GROUP|ROUND_GROUP|SLOT [--target-round N] [--target-group-id N] [--target-slot-id N] [--start-time "..."] [--end-time "..."] [--status 1|2]',
  endpoints: ['POST /admin/notifications'],
  run: async (ctx) => {
    const payload = createPayload(ctx)
    const { data } = await ctx.client.request({ method: 'POST', path: '/admin/notifications', body: payload })
    return data
  },
})

register('notifications update', {
  summary: '编辑横幅通知',
  usage: 'ch notifications update <id> [--title ...] [--content ...] [--notice-level ...] [--scope-type ...] [--start-time ...] [--end-time ...]',
  endpoints: ['PUT /admin/notifications/{id}'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '通知 id' })
    const payload = updatePayload(ctx)
    const { data } = await ctx.client.request({ method: 'PUT', path: `/admin/notifications/${id}`, body: payload })
    return data === null ? { updated: true, id: Number(id) } : data
  },
})

register('notifications status', {
  summary: '上/下线路横幅通知',
  usage: 'ch notifications status <id> --status 1|2',
  endpoints: ['PATCH /admin/notifications/{id}/status'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '通知 id' })
    const status = flagEnum(ctx, 'status', ['1', '2'], { required: true, label: 'ch notifications status <id> --status 1|2' })
    const payload = payloadFrom(ctx, { status: Number(status) })
    const { data } = await ctx.client.request({ method: 'PATCH', path: `/admin/notifications/${id}/status`, body: payload })
    return data === null ? { updated: true, id: Number(id) } : data
  },
})

register('notifications delete', {
  summary: '删除横幅通知',
  usage: 'ch notifications delete <id>',
  endpoints: ['DELETE /admin/notifications/{id}'],
  run: async (ctx) => {
    const id = idParam(ctx.positionals[0], { label: '通知 id' })
    const { data } = await ctx.client.request({ method: 'DELETE', path: `/admin/notifications/${id}` })
    return data === null ? { deleted: true, id: Number(id) } : data
  },
})
