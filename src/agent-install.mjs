import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { usageError } from './errors.mjs'
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const AGENTS = ['codex', 'dsh', 'opencode', 'openclaw', 'pi']
function isSymlink(file) { try { return fs.lstatSync(file).isSymbolicLink() } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
function checkParents(root, target) {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw usageError('安装目标超出安装根目录')
  let current = root
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    if (isSymlink(current)) throw usageError(`拒绝通过符号链接安装：${current}`)
  }
}
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'"
function copyOwned(source, target) {
  if (isSymlink(target)) throw usageError(`拒绝覆盖符号链接：${target}`)
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(target, { recursive: true })
    for (const name of fs.readdirSync(source)) copyOwned(path.join(source, name), path.join(target, name))
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const bytes = fs.readFileSync(source)
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(bytes)) fs.copyFileSync(target, `${target}.before-cloudhouse-update`)
    fs.writeFileSync(target, bytes)
  }
}
export function installAgent(agent, scope, env, cwd = process.cwd()) {
  if (!AGENTS.includes(agent)) throw usageError(`agent 必须是 ${AGENTS.join('|')}`)
  if (!['user', 'project'].includes(scope)) throw usageError('--scope 必须是 user|project')
  const home = env.CH_AGENT_HOME || os.homedir()
  const root = scope === 'user' ? home : cwd
  const skillDest = { opencode: scope === 'user' ? '.config/opencode/skills' : '.opencode/skills', openclaw: scope === 'user' ? '.openclaw/skills' : 'skills', pi: scope === 'user' ? '.pi/agent/skills' : '.pi/skills' }
  let target, activation
  if (skillDest[agent]) {
    target = path.join(root, skillDest[agent], 'cloudhouse-admin')
    checkParents(root, target)
    copyOwned(path.join(CLI_ROOT, 'skills/cloudhouse-admin'), target)
    activation = '启动新会话；使用 cloudhouse-admin 技能。CLI 默认 local，生产调用必须指定 --profile prod。'
  } else {
    target = path.join(root, scope === 'user' ? '.config/cloudhouse-cli/agents' : '.cloudhouse/agents', agent)
    checkParents(root, target)
    copyOwned(path.join(CLI_ROOT, 'integrations', agent), target)
    activation = agent === 'codex' ? `运行 codex plugin marketplace add ${shellQuote(target)}，再运行 codex plugin add cloudhouse-admin@cloudhouse-admin-local。` : `在 DSH 导入 ${path.join(target, 'package.json')} 对应的本地插件，并启用；cordis.yml 配置示例见该目录 README.md。`
  }
  return { agent, scope, installedTo: target, activation, credentialsIncluded: false }
}
