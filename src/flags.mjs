/**
 * flag 词表：`argv.mjs` 只做机械切分，本模块负责「认不认识这个 flag」与「它该不该有值」。
 *
 * 为什么显式写表而不是运行时扫源码：启动不依赖文件系统、表本身可读可 grep，
 * 代价（新加 flag 必须登记）由 `test/flags.test.mjs` 双向核对来付——
 * 漏登记与陈旧登记都会被测试拦下，不会退化成又一次静默丢失。
 *
 * 0.2.0 参数策略：
 *   VALUE_FLAGS 收到布尔（即 `--flag` 后面没有取值，或取值以 `-` 开头）→ exit 2；
 *   未登记、不适用的 flag 与多余位置参数 → 请求前 exit 2；
 *   `ch api` 是逃生舱，两个检查都跳过，否则未文档化的新端点参数会被本地拦死。
 */
import { usageError } from './errors.mjs'

/** 必须取值的 flag：丢了取值就等于丢了筛选条件或写进错数据，绝不能静默 */
export const VALUE_FLAGS = new Set([
  // 全局
  'profile', 'base-url', 'timeout', 'scope', 'cursor', 'filters', 'enabled',
  // 载荷与请求构造
  'data', 'd', 'q', 'H', 'reason', 'request-id', 'page', 'size', 'page-size', 'group-id',
  // 账号 / 申请 / 个人资料
  'studentNo', 'password', 'admin-level', 'real-name', 'authorized-group-ids', 'count',
  'apply-group-id', 'position-code', 'phone',
  // 候选人
  'keyword', 'status', 'second-round-group-id', 'third-round-group-id',
  'third-round-choice-state', 'starred-admin-id', 'starred-by-me', 'group-ids', 'version',
  // 组别 / 方案 / 场次
  'group-name', 'requirement', 'introduction', 'round', 'scope-group-id', 'assessment-content',
  'assessment-image-url', 'assessment-file-url', 'assessment-file-name', 'pass-text-content',
  'pass-image-url', 'fail-text-content', 'fail-image-url', 'booking-start-time', 'booking-end-time',
  'publish-time', 'publish-mode', 'plan-id', 'slot-time', 'location', 'capacity',
  // 面试 / 评价 / 现场助手
  'slot', 'slot-id', 'interview-id', 'result', 'remark', 'content', 'score', 'evaluation-content',
  // 通知
  'title', 'notice-level', 'scope-type', 'target-round', 'target-group-id', 'target-slot-id',
  'start-time', 'end-time',
  // 上传 / 下载
  'file', 'name', 'out',
  // 数据型布尔：必须写明确取值。归到取值型而不是开关型，`--starred maybe` 才会
  // 当场报错，而不是把 maybe 甩给位置参数、自己退化成 starred:true。
  'starred', 'paused',
  // AI Coding
  'opens-at', 'closes-at', 'publish-at', 'survey-seconds', 'coding-seconds', 'reflection-seconds',
  'reflection-mode', 'assignment-version', 'expected-revision', 'key-version', 'api-key',
  'public-comment', 'internal-comment', 'state', 'grade-state', 'eligibility', 'ids',
  // 签到快照
  'screen-token',
])

/** 可裸写的开关；带取值时也接受（`--public=false`），取值按 parseBoolFlag 判定 */
export const BOOL_FLAGS = new Set([
  'pretty', 'json', 'help', 'public', 'show-token', 'force', 'allow-profile-mismatch', 'all',
])

export function isKnownFlag(name) {
  return VALUE_FLAGS.has(name) || BOOL_FLAGS.has(name)
}

/** Usage metadata is also the executable parameter contract. */
const GLOBAL_FLAGS = ['pretty', 'json', 'help', 'profile', 'base-url', 'timeout', 'allow-profile-mismatch']
const PLAN_FIELDS = ['assessment-content', 'assessment-image-url', 'assessment-file-url', 'assessment-file-name', 'pass-text-content', 'pass-image-url', 'fail-text-content', 'fail-image-url', 'booking-start-time', 'booking-end-time', 'publish-time', 'publish-mode', 'status']
const AI_FIELDS = ['name', 'group-ids', 'opens-at', 'closes-at', 'publish-at', 'survey-seconds', 'coding-seconds', 'reflection-seconds', 'reflection-mode']
const EXTRAS = {
  'plans update': PLAN_FIELDS,
  'notifications update': ['notice-level', 'target-round', 'target-group-id', 'target-slot-id', 'status'],
  'ai plans:update': AI_FIELDS,
  'ai plans:credential': ['key-version'],
  'ai attempts:grade': ['expected-revision'],
  'uploads attachment-download': ['force'],
  'uploads image': ['file'],
  'uploads assessment': ['file'],
  'uploads ai-attachment': ['file'],
}
export function usageLines(spec) {
  return (Array.isArray(spec.usage) ? spec.usage : String(spec.usage || '').split('\n')).map(s => s.trim())
}
function selectedUsage(spec, positionals) {
  const rows = usageLines(spec)
  const prefix = `ch ${spec.name} `
  return rows.find(s => s.startsWith(`${prefix}${positionals[0]} `) || s === `${prefix}${positionals[0]}`) || rows[0] || ''
}
export function supportedFlags(spec, positionals = []) {
  const text = positionals.length ? selectedUsage(spec, positionals) : usageLines(spec).join(' ')
  const names = new Set([...GLOBAL_FLAGS, ...(spec.allowedFlags || []), ...(EXTRAS[spec.name] || []), ...(EXTRAS[`${spec.name}:${positionals[0]}`] || [])])
  for (const m of text.matchAll(/(?:^|[\s\[])--?([A-Za-z][\w-]*)/g)) names.add(m[1])
  const action = positionals[0]
  const writes = (spec.endpoints || []).some(e => !e.startsWith('GET ')) && !['list', 'get', 'get-generation'].includes(action)
  const payloadCommand = /^(?:ai (?:plans|attempts|candidates|papers)|(?:plans|groups|slots|notifications|accounts) (?:create|update|batch|reset-password|status)|profile (?:update|change-password)|applies (?:submit|reject)|candidates (?:set-third-round-choice|star|update|application-status|set-second-round-groups|unbind-wechat)|evaluations add|interviews (?:result|attendance|reschedule|batch-result)|assistant submit)$/.test(spec.name)
  if (writes && payloadCommand) { names.add('d'); names.add('data') }
  if (spec.requestId && writes) { names.add('request-id'); names.add('version') }
  return names
}
export function expectedPositionals(spec, positionals = []) {
  const rows = spec.name && positionals.length ? [selectedUsage(spec, positionals)] : usageLines(spec)
  return Math.max(0, ...rows.map(line => {
    const clean = line.split('   #')[0].replace(/(^|[\s\[])--?[\w-]+\s+<[^>]+>/g, '$1').replace(/\[[^\]]*\]/g, '')
    const placeholders = (clean.match(/<[^>\s]+>/g) || []).length
    if (!spec.name) return placeholders
    const tail = clean.startsWith(`ch ${spec.name}`) ? clean.slice(`ch ${spec.name}`.length).trim() : ''
    const action = tail && !tail.startsWith('<') && !tail.startsWith('-') ? 1 : 0
    return placeholders + action
  }))
}
export function checkFlags({ entries, spec, positionals = [] }) {
  if (spec.permissiveFlags) return []
  const supported = supportedFlags(spec, positionals)
  for (const [name, value] of entries) {
    if (VALUE_FLAGS.has(name) && value === true) throw usageError(`--${name} 需要取值`, `写成 --${name} <值> 或 --${name}=<值>`)
    if (!supported.has(name)) throw usageError(`未识别的 flag 或不适用于 ${spec.name}：--${name}`, '用 ch help <命令> 核对参数；已阻止发送请求')
  }
  const expected = expectedPositionals(spec, positionals)
  if (positionals.length > expected) throw usageError(`${spec.name} 只使用 ${expected} 个位置参数，多余参数已拒绝`, '用 ch help <命令> 核对用法')
  return []
}
