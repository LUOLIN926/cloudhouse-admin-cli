import { register } from './index.mjs'
import { usageError } from '../errors.mjs'
import { collectQuery, parseNumber } from '../query.mjs'
import { flagEnum, flagString, flagNumber, flagBool, payloadFrom, camelCase } from '../payload.mjs'
import { requireReason } from '../sensitive.mjs'
import { runWithVersionRetry, newRequestId } from '../idempotent.mjs'
import { toShanghaiOffset } from '../time.mjs'
import { idParam, textParam } from '../path.mjs'

/** planInputFromFlags 的 flag 清单：常量声明，flag 词表守护测试才扫得到内联字面量以外的名字 */
const PLAN_TIME_FLAGS = ['opens-at', 'closes-at', 'publish-at']
const DURATION_FLAGS = ['survey-seconds', 'coding-seconds', 'reflection-seconds']

/**
 * requestId 优先级：重试下发的新 id > --request-id > -d 里的 requestId > 新生成。
 * 「重试下发的 id」排第一是有意的：runWithVersionRetry 只在自动重试时给出取值，
 * 首次请求给 null，此时才轮到显式 --request-id。若把显式 id 放在最前，版本冲突重试
 * 会复用同一个 id，而重试 body 里的 version 已经变了——后端 replay() 判定
 * 「同 requestId + 不同 body」直接抛 IDEMPOTENCY_CONFLICT，自动重试于是永远失败。
 * 早先的 `{ requestId: ..., ...base }` 还会让 -d 反向盖掉 --request-id。
 * 带自动重试的写命令由 runWithVersionRetry 统一签发 id，因此 -d 里写 requestId
 * 在这些命令上不再生效——幂等只保留一个来源，比「看哪个 flag 后写」更可预测。
 * @param {object} ctx
 * @param {object} base
 * @param {string|null} [issued] runWithVersionRetry 下发的 id（仅重试时非空）
 */
function withRequestId(ctx, base, issued = null) {
  const explicit = flagString(ctx, 'request-id')
  return { ...base, requestId: issued || explicit || base.requestId || newRequestId() }
}

/** 列表查询参数（page/pageSize + 各资源特有筛选） */
function listQuery(ctx, extra = {}) {
  const query = collectQuery(ctx, { page: { parse: parseNumber }, 'page-size': { key: 'pageSize', parse: parseNumber }, ...extra })
  return query
}

/**
 * AI Coding 的 groupIds 必须保持「字符串数组」：后端 AiCodingValidation.ids()
 * 对非 textual 元素直接 400，再逐个 Long.parseLong。
 * 但原来的 `.filter(Boolean)` 会把空段静默丢掉（`1,,3` 变成两个），改成显式拒绝。
 */
function parseGroupIds(raw) {
  return String(raw).split(',').map((part) => {
    const text = part.trim()
    if (!/^[1-9]\d*$/.test(text)) {
      throw usageError(`--group-ids 含无效 id：${text === '' ? '（空段）' : text}`, '用逗号分隔的正整数，如 --group-ids 1,2,3；不要留空段或尾随逗号')
    }
    return text
  })
}

/* ============================ ai plans ============================ */

const PLAN_ACTIONS = new Set(['list', 'get', 'create', 'update', 'publish', 'withdraw', 'starts', 'publication', 'credential'])

function planInputFromFlags(ctx) {
  const base = {}
  const name = flagString(ctx, 'name', { required: true, label: 'ch ai plans create --name 计划名' })
  base.name = name
  const groupIds = flagString(ctx, 'group-ids', { required: true, label: '--group-ids 1,2' })
  base.groupIds = parseGroupIds(groupIds)
  for (const flag of PLAN_TIME_FLAGS) {
    const value = flagString(ctx, flag)
    base[camelCase(flag)] = value === undefined ? null : toShanghaiOffset(value)
  }
  const reflectionMode = flagEnum(ctx, 'reflection-mode', ['STATIC', 'PERSONALIZED'])
  if (reflectionMode !== undefined) base.reflectionMode = reflectionMode
  const durations = {}
  for (const flag of DURATION_FLAGS) {
    const value = flagNumber(ctx, flag)
    if (value !== undefined) durations[camelCase(flag)] = value
  }
  if (Object.keys(durations).length > 0) base.durations = durations
  return payloadFrom(ctx, base)
}

register('ai plans', {
  summary: 'AI Coding 计划：list/get/create/update/publish/withdraw/starts/publication/credential',
  // 只有 AI Coding 端点读 body.requestId 并去重，因此 --request-id 仅在这些命令上有意义
  requestId: true,
  usage: [
    'ch ai plans list [--page N] [--page-size N] [--status DRAFT|PUBLISHED] [--group-id N]',
    'ch ai plans get <id>',
    'ch ai plans create --name 名 --group-ids 1,2 [--opens-at "..."] [--closes-at "..."] [--publish-at "..."] [--survey-seconds N] [--coding-seconds N] [--reflection-seconds N] [--reflection-mode STATIC|PERSONALIZED] [-d @plan.json]',
    'ch ai plans update <id> [...同 create...] [--version N]   # version 缺省自动重读',
    'ch ai plans publish <id>',
    'ch ai plans withdraw <id> --reason 原因',
    'ch ai plans starts <id> --paused true|false --reason 原因',
    'ch ai plans publication <id> --publish-at "..." --reason 原因',
    'ch ai plans credential <id> <modelId> --api-key sk-... --reason 原因',
  ].join('\n  '),
  endpoints: [
    'GET /admin/ai-coding/plans',
    'POST /admin/ai-coding/plans',
    'GET /admin/ai-coding/plans/{id}',
    'PUT /admin/ai-coding/plans/{id}',
    'POST /admin/ai-coding/plans/{id}/publish',
    'POST /admin/ai-coding/plans/{id}/withdraw',
    'PATCH /admin/ai-coding/plans/{id}/starts',
    'PATCH /admin/ai-coding/plans/{id}/publication',
    'PUT /admin/ai-coding/plans/{id}/models/{modelId}/credential',
  ],
  run: async (ctx) => {
    const [action, ...rest] = ctx.positionals
    if (!PLAN_ACTIONS.has(action)) {
      throw usageError(`ai plans 子命令必须是 ${[...PLAN_ACTIONS].join('|')}`, '用法：ch help ai plans')
    }
    const id = textParam(rest[0], { label: 'id', allowEmpty: true })

    if (action === 'list') {
      const { data } = await ctx.client.request({
        method: 'GET',
        path: '/admin/ai-coding/plans',
        query: listQuery(ctx, { status: { key: 'status' }, 'group-id': { key: 'groupId' } }),
      })
      return data
    }
    if (action === 'get') {
      if (!id) throw usageError('缺少计划 id', '用法：ch ai plans get <id>')
      const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/plans/${id}` })
      return data
    }
    if (action === 'create') {
      const input = planInputFromFlags(ctx)
      const { data } = await ctx.client.request({
        method: 'POST',
        path: '/admin/ai-coding/plans',
        body: withRequestId(ctx, input),
      })
      return data
    }
    if (action === 'update') {
      if (!id) throw usageError('缺少计划 id', '用法：ch ai plans update <id>')
      const input = planInputFromFlags(ctx)
      return runWithVersionRetry({
        explicitVersion: flagNumber(ctx, 'version'),
        explicitRequestId: flagString(ctx, 'request-id'),
        readVersion: async () => {
          const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/plans/${id}` })
          if (typeof data?.version !== 'number') throw usageError('计划详情中没有 version')
          return data.version
        },
        log: (m) => ctx.log(m),
        run: async ({ requestId, version }) => {
          const { data } = await ctx.client.request({
            method: 'PUT',
            path: `/admin/ai-coding/plans/${id}`,
            body: withRequestId(ctx, { ...input, version }, requestId),
          })
          return data
        },
      })
    }
    if (action === 'publish') {
      if (!id) throw usageError('缺少计划 id', '用法：ch ai plans publish <id>')
      return runWithVersionRetry({
        explicitVersion: flagNumber(ctx, 'version'),
        explicitRequestId: flagString(ctx, 'request-id'),
        readVersion: async () => {
          const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/plans/${id}` })
          if (typeof data?.version !== 'number') throw usageError('计划详情中没有 version')
          return data.version
        },
        log: (m) => ctx.log(m),
        run: async ({ requestId, version }) => {
          const { data } = await ctx.client.request({
            method: 'POST',
            path: `/admin/ai-coding/plans/${id}/publish`,
            body: withRequestId(ctx, { version }, requestId),
          })
          return data
        },
      })
    }
    if (action === 'withdraw') {
      if (!id) throw usageError('缺少计划 id', '用法：ch ai plans withdraw <id> --reason 原因')
      const reason = requireReason(ctx, { label: 'ch ai plans withdraw <id> --reason 原因' })
      return runWithVersionRetry({
        explicitVersion: flagNumber(ctx, 'version'),
        explicitRequestId: flagString(ctx, 'request-id'),
        readVersion: async () => {
          const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/plans/${id}` })
          if (typeof data?.version !== 'number') throw usageError('计划详情中没有 version')
          return data.version
        },
        log: (m) => ctx.log(m),
        run: async ({ requestId, version }) => {
          const { data } = await ctx.client.request({
            method: 'POST',
            path: `/admin/ai-coding/plans/${id}/withdraw`,
            body: withRequestId(ctx, { version, reason }, requestId),
          })
          return data
        },
      })
    }
    if (action === 'starts') {
      if (!id) throw usageError('缺少计划 id', '用法：ch ai plans starts <id> --paused true --reason 原因')
      const paused = flagBool(ctx, 'paused')
      if (paused === undefined) throw usageError('缺少 --paused', '用法：ch ai plans starts <id> --paused true|false --reason 原因')
      const reason = requireReason(ctx, { label: '--reason 原因' })
      return runWithVersionRetry({
        explicitVersion: flagNumber(ctx, 'version'),
        explicitRequestId: flagString(ctx, 'request-id'),
        readVersion: async () => {
          const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/plans/${id}` })
          if (typeof data?.version !== 'number') throw usageError('计划详情中没有 version')
          return data.version
        },
        log: (m) => ctx.log(m),
        run: async ({ requestId, version }) => {
          const { data } = await ctx.client.request({
            method: 'PATCH',
            path: `/admin/ai-coding/plans/${id}/starts`,
            body: withRequestId(ctx, { version, paused, reason }, requestId),
          })
          return data
        },
      })
    }
    if (action === 'publication') {
      if (!id) throw usageError('缺少计划 id', '用法：ch ai plans publication <id> --publish-at "..." --reason 原因')
      const publishAt = flagString(ctx, 'publish-at', { required: true, label: '--publish-at "2026-09-29 09:00"' })
      const reason = requireReason(ctx, { label: '--reason 原因' })
      return runWithVersionRetry({
        explicitVersion: flagNumber(ctx, 'version'),
        explicitRequestId: flagString(ctx, 'request-id'),
        readVersion: async () => {
          const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/plans/${id}` })
          if (typeof data?.version !== 'number') throw usageError('计划详情中没有 version')
          return data.version
        },
        log: (m) => ctx.log(m),
        run: async ({ requestId, version }) => {
          const { data } = await ctx.client.request({
            method: 'PATCH',
            path: `/admin/ai-coding/plans/${id}/publication`,
            body: withRequestId(ctx, { version, publishAt: toShanghaiOffset(publishAt), reason }, requestId),
          })
          return data
        },
      })
    }
    // action === 'credential'
    const modelId = rest[1]
    if (!modelId) throw usageError('缺少 modelId', '用法：ch ai plans credential <id> <modelId> --api-key sk-... --reason 原因')
    const apiKey = flagString(ctx, 'api-key', { required: true, label: '--api-key sk-...' })
    const reason = requireReason(ctx, { label: '--reason 轮换原因' })
    return runWithVersionRetry({
      explicitVersion: flagNumber(ctx, 'key-version'),
      explicitRequestId: flagString(ctx, 'request-id'),
      readVersion: async () => {
        const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/plans/${id}` })
        const model = Array.isArray(data?.models) ? data.models.find((m) => String(m.id) === String(modelId)) : null
        if (!model || typeof model.keyVersion !== 'number') {
          throw usageError(`计划 ${id} 中找不到模型 ${modelId} 的 keyVersion，可用 --key-version 显式指定`)
        }
        return model.keyVersion
      },
      log: (m) => ctx.log(m),
      run: async ({ requestId, version }) => {
        const { data } = await ctx.client.request({
          method: 'PUT',
          path: `/admin/ai-coding/plans/${id}/models/${textParam(modelId, { label: 'modelId' })}/credential`,
          body: withRequestId(ctx, { keyVersion: version, apiKey, reason }, requestId),
        })
        return data
      },
    })
  },
})

/* ============================ ai attempts ============================ */

const ATTEMPT_ACTIONS = new Set(['list', 'get', 'grade', 'void'])

register('ai attempts', {
  summary: 'AI Coding 考次：list/get/grade/void',
  requestId: true,
  usage: [
    'ch ai attempts list [--page N] [--page-size N] [--plan-id N] [--group-id N] [--state SURVEY|CODING|REFLECTION|SUBMITTED|VOIDED] [--grade-state UNGRADED|HIDDEN|PUBLISHED|VOIDED] [--keyword 关键词]',
    'ch ai attempts get <id>',
    'ch ai attempts grade <id> --score 85 --public-comment 公开评价 --internal-comment 内部评价 [--reason 修正原因]',
    'ch ai attempts void <id> --reason 原因',
  ].join('\n  '),
  endpoints: [
    'GET /admin/ai-coding/attempts',
    'GET /admin/ai-coding/attempts/{id}',
    'PUT /admin/ai-coding/attempts/{id}/grade',
    'POST /admin/ai-coding/attempts/{id}/void',
  ],
  run: async (ctx) => {
    const [action, ...rest] = ctx.positionals
    if (!ATTEMPT_ACTIONS.has(action)) {
      throw usageError(`ai attempts 子命令必须是 ${[...ATTEMPT_ACTIONS].join('|')}`, '用法：ch help ai attempts')
    }
    const id = textParam(rest[0], { label: 'id', allowEmpty: true })

    if (action === 'list') {
      const { data } = await ctx.client.request({
        method: 'GET',
        path: '/admin/ai-coding/attempts',
        query: listQuery(ctx, {
          'plan-id': { key: 'planId' },
          'group-id': { key: 'groupId' },
          state: { key: 'state' },
          'grade-state': { key: 'gradeState' },
          keyword: { key: 'keyword' },
        }),
      })
      return data
    }
    if (action === 'get') {
      if (!id) throw usageError('缺少考次 id', '用法：ch ai attempts get <id>')
      const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/attempts/${id}` })
      return data
    }
    if (action === 'grade') {
      if (!id) throw usageError('缺少考次 id', '用法：ch ai attempts grade <id> --score 85 --public-comment ...')
      const score = flagNumber(ctx, 'score', { required: true, label: '--score 0-100 整数' })
      if (!Number.isInteger(score) || score < 0 || score > 100) throw usageError('--score 必须是 0-100 的整数')
      const publicComment = flagString(ctx, 'public-comment', { required: true, label: '--public-comment 考生可见评价' })
      const internalComment = flagString(ctx, 'internal-comment', { required: true, label: '--internal-comment 内部评价' })
      const reason = flagString(ctx, 'reason')
      return runWithVersionRetry({
        explicitVersion: flagNumber(ctx, 'expected-revision'),
        explicitRequestId: flagString(ctx, 'request-id'),
        readVersion: async () => {
          const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/attempts/${id}` })
          if (typeof data?.attempt?.version !== 'number') throw usageError('考次详情中没有 attempt.version')
          return data.attempt.version
        },
        log: (m) => ctx.log(m),
        run: async ({ requestId, version }) => {
          const base = { expectedRevision: version, score, publicComment, internalComment }
          if (reason !== undefined) base.reason = reason
          const { data } = await ctx.client.request({
            method: 'PUT',
            path: `/admin/ai-coding/attempts/${id}/grade`,
            body: withRequestId(ctx, payloadFrom(ctx, base), requestId),
          })
          return data
        },
      })
    }
    // action === 'void'
    if (!id) throw usageError('缺少考次 id', '用法：ch ai attempts void <id> --reason 原因')
    const reason = requireReason(ctx, { label: 'ch ai attempts void <id> --reason 原因' })
    return runWithVersionRetry({
      explicitVersion: flagNumber(ctx, 'version'),
      explicitRequestId: flagString(ctx, 'request-id'),
      readVersion: async () => {
        const { data } = await ctx.client.request({ method: 'GET', path: `/admin/ai-coding/attempts/${id}` })
        if (typeof data?.attempt?.version !== 'number') throw usageError('考次详情中没有 attempt.version')
        return data.attempt.version
      },
      log: (m) => ctx.log(m),
      run: async ({ requestId, version }) => {
        const { data } = await ctx.client.request({
          method: 'POST',
          path: `/admin/ai-coding/attempts/${id}/void`,
          body: withRequestId(ctx, { version, reason }, requestId),
        })
        return data
      },
    })
  },
})

/* ============================ ai candidates ============================ */

const CANDIDATE_ACTIONS = new Set(['list', 'retake'])

register('ai candidates', {
  summary: 'AI Coding 考生资格：list/retake（安排重考）',
  requestId: true,
  usage: [
    'ch ai candidates list [--page N] [--page-size N] [--plan-id N] [--group-id N] [--eligibility NOT_REQUIRED|WAITING_SELECTION|INELIGIBLE|EXEMPT|REQUIRED] [--keyword 关键词]',
    'ch ai candidates retake <userId> --plan-id N --assignment-version N --opens-at "..." --closes-at "..." --reason 原因',
  ].join('\n  '),
  endpoints: ['GET /admin/ai-coding/candidates', 'POST /admin/ai-coding/candidates/{userId}/retake'],
  run: async (ctx) => {
    const [action, ...rest] = ctx.positionals
    if (!CANDIDATE_ACTIONS.has(action)) {
      throw usageError(`ai candidates 子命令必须是 ${[...CANDIDATE_ACTIONS].join('|')}`, '用法：ch help ai candidates')
    }
    if (action === 'list') {
      const { data } = await ctx.client.request({
        method: 'GET',
        path: '/admin/ai-coding/candidates',
        query: listQuery(ctx, {
          'plan-id': { key: 'planId' },
          'group-id': { key: 'groupId' },
          eligibility: { key: 'eligibility' },
          keyword: { key: 'keyword' },
        }),
      })
      return data
    }
    const userId = idParam(rest[0], { label: 'userId' })
    const planId = flagString(ctx, 'plan-id', { required: true, label: '--plan-id N' })
    const assignmentVersion = flagNumber(ctx, 'assignment-version', { required: true, label: '--assignment-version N（取自 ch ai candidates list 的 assignmentVersion）' })
    const opensAt = flagString(ctx, 'opens-at', { required: true, label: '--opens-at "2026-09-29 10:00"' })
    const closesAt = flagString(ctx, 'closes-at', { required: true, label: '--closes-at "2026-09-29 12:00"' })
    const reason = requireReason(ctx, { label: '--reason 重考原因' })
    const { data } = await ctx.client.request({
      method: 'POST',
      path: `/admin/ai-coding/candidates/${userId}/retake`,
      body: withRequestId(ctx, {
        planId,
        assignmentVersion,
        opensAt: toShanghaiOffset(opensAt),
        closesAt: toShanghaiOffset(closesAt),
        reason,
      }),
    })
    return data
  },
})
