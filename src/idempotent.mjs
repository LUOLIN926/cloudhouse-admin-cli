/**
 * 幂等与版本重试（对齐 admin-web lib/idempotency.ts 语义）：
 * - requestId 只对 `ch ai *` 写操作有意义：全仓只有 backend/aicoding 读 body.requestId 并去重，
 *   interviews / plans / slots 等端点的审计 requestId 由服务端自己生成（AdminInterviewAuditContext），
 *   客户端传了也不被读取，所以那些命令上的 --request-id 会被 CLI 直接拒绝而不是静默丢弃。
 * - AI 写操作默认每次生成新 requestId；--request-id 可复用（服务端去重返回首个结果）
 * - 4xx（非 429）为确定性拒绝：换 requestId 视为新操作
 * - VERSION_CONFLICT / GRADE_VERSION_CONFLICT：仅当 version 由 CLI 本轮自读时，重读后以新 requestId 重试；
 *   显式传入的 version 绝不自动重试（不把调用方意图变成隐式覆盖）
 */
import { randomUUID } from 'node:crypto'

import { CliError } from './errors.mjs'

export function newRequestId() {
  return randomUUID()
}

export function isDefinitiveRejection(err) {
  if (!(err instanceof CliError)) return false
  if (err.httpStatus === null) return false
  return err.httpStatus >= 400 && err.httpStatus < 500 && err.httpStatus !== 429
}

export function isVersionConflict(err) {
  return err instanceof CliError && (err.reasonCode === 'VERSION_CONFLICT' || err.reasonCode === 'GRADE_VERSION_CONFLICT')
}

function currentVersionOf(err) {
  const payload = err && err.payload
  if (!payload || typeof payload !== 'object') return null
  for (const key of ['currentVersion', 'version', 'expectedRevision', 'latestVersion']) {
    if (typeof payload[key] === 'number') return payload[key]
  }
  return null
}

/**
 * @param {object} options
 * @param {number|undefined} options.explicitVersion 调用方显式传入的 version（存在则不自动重试）
 * @param {string|null} [options.explicitRequestId] 调用方用 --request-id 指定的 id，只作用于首次请求
 * @param {() => Promise<number>} options.readVersion 从服务端重读最新 version
 * @param {({requestId:string|null, version:number}) => Promise<unknown>} options.run 实际写操作
 * @param {number} [options.maxRetries] 最大自动重试次数（默认 2）
 * @param {(message:string) => void} [options.log] stderr 进度日志
 */
export async function runWithVersionRetry({ explicitVersion, explicitRequestId = null, readVersion, run, maxRetries = 2, log = () => {} }) {
  if (explicitVersion !== undefined) {
    return run({ requestId: explicitRequestId || newRequestId(), version: Number(explicitVersion) })
  }
  let attempt = 0
  for (;;) {
    const version = await readVersion()
    // 重试必须换 requestId：版本冲突重试的 body 里 version 一定变了，而后端
    // AiCodingOperations.replay() 对「同 requestId + 不同 bodyHash」直接抛
    // IDEMPOTENCY_CONFLICT——沿用调用方给的 id 会让自动重试永远失败。
    const requestId = attempt === 0 ? explicitRequestId || newRequestId() : newRequestId()
    if (attempt > 0 && explicitRequestId) {
      log(`本次重试用新的 requestId（--request-id ${explicitRequestId} 只作用于首次请求；同 id 配不同 body 会被判 IDEMPOTENCY_CONFLICT）`)
    }
    try {
      return await run({ requestId, version })
    } catch (err) {
      if (isVersionConflict(err) && attempt < maxRetries) {
        attempt += 1
        const current = currentVersionOf(err)
        log(
          `版本冲突（服务端当前版本：${current ?? version}），自动重读重试 ${attempt}/${maxRetries}`,
        )
        continue
      }
      throw err
    }
  }
}
