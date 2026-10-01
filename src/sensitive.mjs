import { usageError } from './errors.mjs'

/**
 * 敏感写操作的 reason 前置校验。
 * 这些操作后端强制要求审计原因（三面改组、解绑微信、驳回申请、作废考次、
 * 已公布评分修正、撤回计划、安排重考、轮换模型密钥）。CLI 在本地先行拦截，
 * 缺 --reason 直接 exit 2，不消耗服务端配额、也不产生 4xx 噪音。
 */
export function requireReason(ctx, { max = 200, label } = {}) {
  const value = ctx.flags.get('reason')
  if (typeof value !== 'string' || value.trim() === '') {
    throw usageError(
      '该操作必须提供 --reason（审计原因）',
      label ? `用法：${label}` : undefined,
    )
  }
  const reason = value.trim()
  if (reason.length > max) {
    throw usageError(`--reason 不能超过 ${max} 字（当前 ${reason.length} 字）`)
  }
  return reason
}

/**
 * 可选的审计原因：允许不提供（返回 undefined，调用方不写这个键，由后端补默认文案），
 * 但一旦提供就必须与 requireReason 同一套约束（非空、≤max 字）。
 * `ch interviews attendance` 的 reason 在后端确实是可选的
 * （AdminInterviewAttendanceController:74 把非字符串归一化成 null），
 * 所以不能改成 requireReason——那会把合法操作变成拒绝。
 * 但长度上限必须一致，否则一条 --reason x10000 会原样进审计日志。
 */
export function optionalReason(ctx, { max = 200, label } = {}) {
  const value = ctx.flags.get('reason')
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const reason = value.trim()
  if (reason.length > max) {
    throw usageError(
      `--reason 不能超过 ${max} 字（当前 ${reason.length} 字）`,
      label ? `用法：${label}` : undefined,
    )
  }
  return reason
}

/** 声明某命令需要 reason（供 help 与契约守护测试使用） */
export const REQUIRES_REASON_COMMANDS = new Set([
  'candidates unbind-wechat',
  'candidates third-round-choice',
  'applies reject',
])
