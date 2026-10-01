import http from 'node:http'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CLI_BIN = path.join(__dirname, '..', 'bin', 'ch.mjs')

/**
 * 启动一个最小 mock 后端（复刻 frontend/scripts/mock-backend-server.js 的最小 Node http 模式）。
 * handler 返回 {status, json, headers, raw} 或 undefined（404）。
 */
export function startMockServer(handler) {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body0 = Buffer.concat(chunks).toString('utf8')
    const url = new URL(req.url, 'http://127.0.0.1')
    if (process.env.CH_TEST_COVERAGE_FILE) fs.appendFileSync(process.env.CH_TEST_COVERAGE_FILE, JSON.stringify({ method: req.method, path: url.pathname.replace(/^\/api/, '') }) + '\n')
    const contentType = String(req.headers['content-type'] || '')
    const isJson = contentType.includes('application/json')
    let body = null
    if (body0 && isJson) {
      try {
        body = JSON.parse(body0)
      } catch {
        body = null
      }
    }
    let result
    try {
      result = await handler({
        method: req.method,
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body,
        rawBody: body0,
      })
    } catch (err) {
      result = { status: 500, json: { code: 500, message: `mock error: ${err.message}` } }
    }
    if (result === undefined) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('mock: no handler')
      return
    }
    const { status = 200, json, headers = {}, raw } = result
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
    res.end(raw !== undefined ? raw : json === undefined ? '' : JSON.stringify(json))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}/api`,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}

/** spawn 真实 bin/ch.mjs，收集 stdout/stderr 与 exit code */
export function runCli(argv, { baseUrl, env = {}, cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [CLI_BIN, ...argv],
      { env: { ...process.env, ...env, ...(baseUrl ? { CH_BASE_URL: baseUrl } : {}) }, ...(cwd ? { cwd } : {}) },
      (err, stdout, stderr) => {
        if (err && typeof err.code !== 'number') {
          reject(err)
          return
        }
        resolve({ code: err ? err.code : 0, stdout, stderr })
      },
    )
  })
}

/** 构造一个带 exp 的本地 JWT（仅测试用，不校验签名） */
export function makeFakeToken(expSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: '1', exp: expSeconds })).toString('base64url')
  return `${header}.${payload}.signature`
}
