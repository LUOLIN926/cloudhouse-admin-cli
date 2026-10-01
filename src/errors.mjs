/**
 * 统一错误类型与 exit code 契约（Agent 按 exit code 分支，不需要解析中文文案）。
 *
 * 退出码：
 *   0 成功
 *   1 普通业务错误（后端 code≠200，未细分）
 *   2 用法错误（本地校验失败：缺参数、缺 reason 等）
 *   3 鉴权失效（HTTP 401，或 HTTP 200 + 业务码 401）：需重新 login
 *   4 权限不足（HTTP 403，或 HTTP 200 + 业务码 403，或 ADMIN_PERMISSION_REQUIRED）
 *   5 限流（429）：后端已限流，稍后重试
 *   6 版本冲突且重试耗尽（VERSION_CONFLICT / GRADE_VERSION_CONFLICT）
 *   7 网络不可达（fetch 抛错）或请求超时（NETWORK_TIMEOUT）
 *   8 功能开关未开（FEATURE_DISABLED）
 *   9 端点未实现（HTTP/业务 code 404 或 405）
 */
export const EXIT = Object.freeze({
  OK: 0,
  BUSINESS: 1,
  USAGE: 2,
  AUTH: 3,
  PERMISSION: 4,
  RATE_LIMIT: 5,
  VERSION_CONFLICT: 6,
  NETWORK: 7,
  FEATURE_DISABLED: 8,
  NOT_IMPLEMENTED: 9,
})

export class CliError extends Error {
  constructor({ code, message, exitCode = EXIT.BUSINESS, reasonCode = null, httpStatus = null, payload = null, hint = null }) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.exitCode = exitCode
    this.reasonCode = reasonCode
    this.httpStatus = httpStatus
    this.payload = payload
    this.hint = hint
  }

  toJSON() {
    const error = { code: this.code, message: this.message }
    if (this.reasonCode) error.reasonCode = this.reasonCode
    if (this.httpStatus !== null) error.httpStatus = this.httpStatus
    if (this.hint) error.hint = this.hint
    return error
  }
}

/** 从后端错误响应体 data 中读取机器可读原因码（与 admin-web readReasonCode 同契约） */
export function readReasonCode(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (typeof payload.reasonCode === 'string') return payload.reasonCode
  // 鉴权错误的历史契约字段是 data.reason（与 reasonCode 同值）
  if (typeof payload.reason === 'string') return payload.reason
  return null
}

export function usageError(message, hint = null) {
  return new CliError({ code: 'USAGE_ERROR', message, exitCode: EXIT.USAGE, hint })
}

const VERSION_CONFLICT_CODES = new Set(['VERSION_CONFLICT', 'GRADE_VERSION_CONFLICT'])
export function isVersionConflictCode(reasonCode) {
  return typeof reasonCode === 'string' && VERSION_CONFLICT_CODES.has(reasonCode)
}

/** 登录端点：只有它的 401 才是「凭据不对」，且带 IP/账号两级限流 */
const LOGIN_PATH = '/auth/login'
/** 明确表示会话而非密码的原因码（JwtInterceptor 与业务端点共用这套词表） */
const SESSION_REASON_CODES = new Set([
  'TOKEN_EXPIRED',
  'SESSION_EXPIRED',
  'SESSION_ABSOLUTE_EXPIRED',
  'AUTH_REQUIRED',
])

/**
 * 把「非成功响应」分类成带 exit code 的 CliError。
 * @param {{httpStatus:number, code:number, message:string, payload:unknown, retryAfter?:string|null, requestPath?:string|null}} input
 */
export function classifyFailure({ httpStatus, code, message, payload, retryAfter = null, requestPath = null }) {
  const reasonCode = readReasonCode(payload)
  const base = { reasonCode, httpStatus, payload, message }

  if (httpStatus === 401) {
    return new CliError({
      ...base,
      code: 'AUTH_EXPIRED',
      exitCode: EXIT.AUTH,
      hint: '会话已失效，请重新执行 ch login',
    })
  }
  if (code === 401) {
    // HTTP 200 + 业务码 401 在本项目有两种含义，必须分开：
    //   /auth/login → 凭据不对（且有 IP 与账号两级限流，必须劝阻连续重试）
    //   其它端点   → 会话没被认出来（如 InterviewAttendanceServiceImpl 的 Result.error(401,"未登录")），
    //              此时说「账号或密码错误」会把 Agent 引向完全错误的补救方向。
    const sessionReason = SESSION_REASON_CODES.has(reasonCode)
    if (requestPath === LOGIN_PATH && !sessionReason) {
      return new CliError({
        ...base,
        code: 'AUTH_REJECTED',
        exitCode: EXIT.AUTH,
        hint: '账号或密码错误；登录接口有限流（IP 60/300s、账号 10/300s），请勿连续重试',
      })
    }
    return new CliError({
      ...base,
      code: 'AUTH_EXPIRED',
      exitCode: EXIT.AUTH,
      hint: '服务端未接受当前会话（原因可能是会话失效、账号停用或请求未带 Token）：先用 ch whoami 确认身份，再重新 ch login；这不是密码错误，无需改用其它凭据重试',
    })
  }
  // 后端权限不足的既有契约是 HTTP 200 + body.code=403（Result.error(403, …) 是纯 POJO，
  // 没有 @ResponseStatus，也没有 ResponseBodyAdvice 把业务码映射回 HTTP 状态；只有
  // JwtInterceptor 与 AiCodingControllerAdvice 会真的设置 HTTP 状态）。只判 httpStatus
  // 会让 exit 4 对绝大多数权限拒绝不可达，Agent 按文档「4 → 停止」的分支就永远走不到。
  if (httpStatus === 403 || code === 403 || reasonCode === 'ADMIN_PERMISSION_REQUIRED') {
    return new CliError({
      ...base,
      code: 'PERMISSION_DENIED',
      exitCode: EXIT.PERMISSION,
      hint: '当前账号权限不足；ch whoami 可查看 adminLevel 与授权组别',
    })
  }
  if (httpStatus === 429 || code === 429) {
    const hint = retryAfter ? `后端限流，请 ${retryAfter} 秒后重试` : '后端限流，请稍后重试'
    return new CliError({ ...base, code: 'RATE_LIMITED', exitCode: EXIT.RATE_LIMIT, hint })
  }
  if (httpStatus === 404 || httpStatus === 405 || httpStatus === 501 || code === 404 || code === 405 || code === 501) {
    return new CliError({
      ...base,
      code: 'NOT_IMPLEMENTED',
      exitCode: EXIT.NOT_IMPLEMENTED,
      hint: '后端未实现该接口；可检查后端版本或用 ch api 直接调用确认',
    })
  }
  if (reasonCode === 'FEATURE_DISABLED') {
    return new CliError({
      ...base,
      code: 'FEATURE_DISABLED',
      exitCode: EXIT.FEATURE_DISABLED,
      hint: '对应功能开关未开启（如 AI Coding / 三面选组 / 飞书签到）',
    })
  }
  if (isVersionConflictCode(reasonCode)) {
    return new CliError({
      ...base,
      code: 'VERSION_CONFLICT',
      exitCode: EXIT.VERSION_CONFLICT,
      hint: '数据版本已变化，请重读后使用最新 version 重试',
    })
  }
  return new CliError({ ...base, code: 'BUSINESS_ERROR', exitCode: EXIT.BUSINESS })
}
