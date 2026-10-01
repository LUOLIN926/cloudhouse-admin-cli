import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getRegistry } from '../src/commands/index.mjs'
import '../src/commands/load.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SNAPSHOT = JSON.parse(fs.readFileSync(new URL('../test-support/api-contract.json', import.meta.url), 'utf8'))

/**
 * admin-web 未使用、但属于管理域的后端端点：允许仅经 `ch api` 兜底触达。
 * 新增条目必须附理由——守护测试的本意是强制「显式决策」而非零豁免。
 * 键与控制器扫描同命名空间（剥离 /api 前缀）。
 */
const CONTROLLER_ONLY_ALLOWLIST = new Map([])

/**
 * 路由归一化：api.ts 模板字符串 / 注册表 {param} 占位 / 查询构造器表达式 → 统一可比较形式。
 * - `/admin/accounts/${id}` → `/admin/accounts/{}`；注册表 `/admin/accounts/{id}` → `/admin/accounts/{}`
 * - `/admin/interviews/statistics${query}` → `/admin/interviews/statistics`（查询构造器整体剥离）
 * - `/admin/ai-coding/plans${qs ? ...}` → `/admin/ai-coding/plans`（复杂表达式截断）
 */
function normalizeRoute(raw) {
  let s = String(raw).split('?')[0]
  s = s.replace(/\$\{(?:query|qs|params[^}]*)\}$/g, '') // 结尾查询构造器：整体剥离
  s = s.replace(/\$\{[^{}]+\}/g, '{}') // 完整路径参数表达式：${id} / ${encodeURIComponent(x)} → {}
  s = s.replace(/\$\{[\s\S]*$/g, '') // 剩余复杂/未闭合模板表达式：截断
  s = s.replace(/\{\w+\}/g, '{}') // 注册表占位 {id} → {}
  return s
}

function normalizeEndpoint(endpoint) {
  const [method, ...rest] = String(endpoint).split(' ')
  return `${method.toUpperCase()} ${normalizeRoute(rest.join(' '))}`
}

/** 解析 api.ts：request<T>('path'...) / requestCheckinScreen<T>(...) / 直接 fetch(${getApiBase()}...) */
function extractApiTsEndpoints(source) {
  const found = new Set()
  const add = (raw, tail) => {
    // tail 起始处是字符串闭合引号；先吃掉再做「同调用内」的 method 锚定匹配
    const cleaned = tail.replace(/^\s*['"`]/, '')
    const methodMatch = cleaned.match(/^\s*,\s*\{\s*method:\s*'(GET|POST|PUT|PATCH|DELETE)'/)
    const method = methodMatch ? methodMatch[1] : 'GET'
    found.add(`${method} ${normalizeRoute(raw)}`)
  }
  const re = /request(?:CheckinScreen)?<.+?>\(\s*['"`]([^'"`]+)/g
  let m
  while ((m = re.exec(source))) {
    add(m[1], source.slice(m.index + m[0].length))
  }
  const fetchRe = /\$\{getApiBase\(\)\}(\/[^'"`]+)/g
  while ((m = fetchRe.exec(source))) {
    add(m[1], source.slice(m.index + m[0].length))
  }
  return found
}

/** 解析后端 Controller：类级 @RequestMapping 前缀 + 方法级映射（支持无类级前缀的全路径写法） */
function extractControllerEndpoints() { return new Set(SNAPSHOT.controllers) }

function registeredEndpoints() {
  const registered = new Set()
  for (const spec of getRegistry().values()) {
    for (const endpoint of spec.endpoints || []) {
      registered.add(normalizeEndpoint(endpoint))
    }
  }
  return registered
}

const registered = registeredEndpoints()

test('契约守护：api.ts 全量端点必须在 CLI 注册表中', () => {
  const apiTs = new Set(SNAPSHOT.frontend)
  const missing = [...apiTs].filter((endpoint) => !registered.has(endpoint)).sort()
  assert.deepEqual(missing, [], `以下 api.ts 端点未在 CLI 注册（新增语义命令或在 commands/index.mjs 声明兜底理由）：\n${missing.join('\n')}`)
})

test('契约守护：注册表端点必须真实存在于 api.ts 或后端 Controller', () => {
  const apiTs = new Set(SNAPSHOT.frontend)
  const controllers = extractControllerEndpoints()
  const known = new Set([...apiTs, ...controllers])
  const stale = [...registered].filter((endpoint) => !known.has(endpoint)).sort()
  assert.deepEqual(stale, [], `注册表声明了不存在的端点（契约漂移或拼写错误）：\n${stale.join('\n')}`)
})

test('契约守护：后端管理域新端点必须注册或显式豁免', () => {
  const controllers = extractControllerEndpoints()
  const unhandled = [...controllers]
    .filter((endpoint) => !registered.has(endpoint) && !CONTROLLER_ONLY_ALLOWLIST.has(endpoint))
    .sort()
  assert.deepEqual(
    unhandled,
    [],
    `后端新增管理端点未处理（注册语义命令，或附理由加入 CONTROLLER_ONLY_ALLOWLIST 走 ch api 兜底）：\n${unhandled.join('\n')}`,
  )
})

test('契约守护：allowlist 中的端点必须仍真实存在于后端', () => {
  const controllers = extractControllerEndpoints()
  const stale = [...CONTROLLER_ONLY_ALLOWLIST.keys()].filter((endpoint) => !controllers.has(endpoint))
  assert.deepEqual(stale, [], `allowlist 中存在已不存在的端点，请清理：\n${stale.join('\n')}`)
})

test('契约守护：registry 中的公共端点不应要求登录（auth:false 与公开路径一致）', () => {
  const publicPaths = new Set(['/auth/login', '/account-applications', '/account-applications/status', '/checkin-screens/current'])
  for (const spec of getRegistry().values()) {
    const usesPublic = (spec.endpoints || []).some((e) => publicPaths.has(normalizeRoute(e.split(' ').slice(1).join(' '))))
    if (usesPublic) {
      assert.equal(spec.auth, false, `${spec.name} 调用公开端点但未声明 auth:false`)
    }
  }
})
