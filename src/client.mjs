import { CliError, classifyFailure, usageError, EXIT } from './errors.mjs'

const RENEWED_TOKEN_HEADER = 'X-Renewed-Token'
const TOKEN_EXPIRES_AT_HEADER = 'X-Token-Expires-At'

/**
 * 没有超时的 fetch 会让 CLI 永久阻塞，对 Agent 流水线是致命的：它无法按退出码分支，
 * 只能被上层 kill 掉。普通请求 30s，multipart 上传放宽到 120s（大附件本来就慢）。
 */
export const DEFAULT_TIMEOUT_MS = 30_000
export const UPLOAD_TIMEOUT_MS = 120_000

/**
 * 封装与后端的全部 HTTP 交互。
 *
 * @param {object} options
 * @param {string} options.baseUrl API 根地址（不含路径），如 http://127.0.0.1:8080/api
 * @param {() => Record<string,string>} options.getAuthHeaders 每次请求时取当前鉴权头（支持续期后换 token）
 * @param {(sentToken:string, renewedToken:string, expiresAtMs:number|null) => void} [options.onRenewal]
 */
export function createClient({ baseUrl, getAuthHeaders, onRenewal, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  /**
   * 路径形状守门：位置参数是裸插值进 path 模板的，`ch candidates get "42?foo=bar"`
   * 实测发出 /users/42?foo=bar/info——new URL() 把尾随的 /info 当成了查询串的值，
   * 请求被静默改形还照旧带上 JWT 打向真实端点。空格 / # \ 与 `..` 同理。
   * 只有 `ch api` 允许在路径里直接写查询串（它就是逃生舱）。
   */
  function buildUrl(requestPath, query, { allowQuery = false } = {}) {
    if (typeof requestPath !== 'string' || !requestPath.startsWith('/')) {
      throw new CliError({
        code: 'INVALID_PATH',
        message: `接口路径必须以 / 开头：${requestPath}`,
        exitCode: EXIT.USAGE,
      })
    }
    const [pathPart, ...rest] = requestPath.split('?')
    if (rest.length > 0 && !allowQuery) {
      throw usageError(`接口路径里不能带查询串：${requestPath}`, '查询参数请用 -q k=v（ch api）或对应的语义 flag')
    }
    if (/[#\s]|\.\./.test(pathPart)) {
      throw usageError(`接口路径含未编码的字符：${requestPath}`, '路径参数中的空格、# 与 .. 会改变请求形状；数字 id 请直接给数字')
    }
    const url = new URL(`${baseUrl.replace(/\/+$/, '')}${requestPath}`)
    if (query) {
      for (const [key, value] of query) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.append(key, String(value))
      }
    }
    return url.toString()
  }

  function absorbRenewal(response, authHeader) {
    if (!onRenewal || !authHeader) return
    const sentToken = authHeader.replace(/^Bearer\s+/i, '')
    const renewed = response.headers.get(RENEWED_TOKEN_HEADER)
    if (!renewed || renewed === sentToken) return
    const rawExpires = response.headers.get(TOKEN_EXPIRES_AT_HEADER)
    const expiresAt = rawExpires !== null && Number.isFinite(Number(rawExpires)) ? Number(rawExpires) : null
    onRenewal(sentToken, renewed, expiresAt)
  }

  /**
   * 发起一次请求。
   * @param {object} request
   * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} [request.method]
   * @param {string} request.path 以 / 开头
   * @param {Array<[string, string|number]>} [request.query] 查询参数
   * @param {unknown} [request.body] 普通 JSON 载荷
   * @param {FormData} [request.formData] multipart 载荷（与 body 互斥）
   * @param {Record<string,string>} [request.headers] 额外请求头
   * @param {boolean} [request.noAuth] 公开端点：不携带 Authorization
   * @param {boolean} [request.raw] 二进制响应模式：返回 Buffer 而非解析 JSON
   * @param {boolean} [request.allowQuery] 允许 path 里直接写查询串（仅 ch api）
   * @returns {Promise<{httpStatus:number, data:unknown}>}
   */
  async function request({ method = 'GET', path: requestPath, query, body, formData, headers = {}, noAuth = false, raw = false, allowQuery = false }) {
    const authHeaders = noAuth ? {} : getAuthHeaders()
    const url = buildUrl(requestPath, query, { allowQuery })

    const requestHeaders = { Accept: 'application/json', ...authHeaders, ...headers }
    let payload
    if (formData !== undefined) {
      payload = formData
    } else if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }

    let response
    const limit = formData !== undefined ? Math.max(timeoutMs, UPLOAD_TIMEOUT_MS) : timeoutMs
    try {
      response = await fetch(url, { method, headers: requestHeaders, body: payload, signal: AbortSignal.timeout(limit), redirect: 'error' })
    } catch (err) {
      const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError')
      if (timedOut) {
        throw new CliError({
          code: 'NETWORK_TIMEOUT',
          message: `请求超时（${limit}ms）：${method} ${url}`,
          exitCode: EXIT.NETWORK,
          hint: '超时不等于没执行：写操作可能已经在后端生效。先用读接口确认结果，不要直接重放；确需放宽用 --timeout <ms>',
        })
      }
      throw new CliError({
        code: 'NETWORK_UNREACHABLE',
        message: `无法连接后端服务（${url}）：${err && err.message ? err.message : err}`,
        exitCode: EXIT.NETWORK,
        hint: '请检查 baseUrl（--base-url / CH_BASE_URL / ch profile）、网络与后端进程',
      })
    }

    absorbRenewal(response, requestHeaders.Authorization)

    let envelope = null
    const binary = raw ? Buffer.from(await response.arrayBuffer()) : null
    const rawJson = raw && /(?:application\/json|\+json)/i.test(response.headers.get('Content-Type') || '')
    if (!raw || rawJson) {
      const text = raw ? binary.toString('utf8') : await response.text()
      if (text) {
        try {
          envelope = JSON.parse(text)
        } catch {
          envelope = null
        }
      }
    }

    const envelopeCode = envelope && typeof envelope.code === 'number' ? envelope.code : null
    if (response.ok && !raw && response.status !== 204 && (envelopeCode === null || !envelope || Array.isArray(envelope))) {
      throw new CliError({ code: 'UNEXPECTED_RESPONSE', message: `接口返回无效 JSON 信封（HTTP ${response.status}）`, exitCode: EXIT.BUSINESS, hint: '检查 API 根地址和代理路由；这不是成功响应，写操作结果未知时先查询确认' })
    }
    if (response.ok && raw && (/text\/html/i.test(response.headers.get('Content-Type') || '') || rawJson && (envelopeCode === null || envelopeCode === 200))) {
      throw new CliError({ code: 'UNEXPECTED_RESPONSE', message: '附件接口返回 HTML 或 JSON，未保存文件', exitCode: EXIT.BUSINESS })
    }
    if (response.ok && (envelopeCode === null || envelopeCode === 200)) {
      if (raw) {
        return {
          httpStatus: response.status,
          contentType: response.headers.get('Content-Type'),
          contentDisposition: response.headers.get('Content-Disposition'),
          buffer: binary,
        }
      }
      return { httpStatus: response.status, data: envelope ? (envelope.data ?? null) : null }
    }

    // 反向代理/网关异常时可能返回 HTML：统一转成结构化错误
    if (!envelope) {
      throw classifyFailure({
        httpStatus: response.status,
        code: response.status,
        message: `请求失败（HTTP ${response.status}，非 JSON 响应）`,
        payload: null,
        retryAfter: response.headers.get('Retry-After'),
        requestPath,
      })
    }

    throw classifyFailure({
      httpStatus: response.status,
      code: envelopeCode ?? response.status,
      message: typeof envelope.message === 'string' && envelope.message ? envelope.message : `请求失败（HTTP ${response.status}）`,
      payload: envelope.data ?? null,
      retryAfter: response.headers.get('Retry-After'),
      requestPath,
    })
  }

  return { request, get baseUrl() { return baseUrl.replace(/\/+$/, '') } }
}
