import { EXIT, CliError, usageError } from './errors.mjs'
import { resolveConfig } from './config.mjs'
import * as sessionStore from './session.mjs'
import { createClient, DEFAULT_TIMEOUT_MS } from './client.mjs'
import { printSuccess, printFailure } from './output.mjs'
import { parseArgs } from './argv.mjs'
import { checkFlags } from './flags.mjs'
import { flagOn } from './payload.mjs'
import { resolveCommand, renderHelp } from './commands/index.mjs'
import './commands/load.mjs'
import { VERSION } from './version.mjs'

/** --timeout <ms>：1s ~ 10min，越界是用法错误而不是一个静默生效的怪值 */
function resolveTimeoutMs(flags) {
  const raw = flags.get('timeout')
  if (raw === undefined) return DEFAULT_TIMEOUT_MS
  const ms = Number(raw)
  if (!Number.isInteger(ms) || ms < 1000 || ms > 600_000) {
    throw usageError('--timeout 必须是 1000 到 600000 之间的整数毫秒', '默认 30000ms；注意超时不等于后端没执行')
  }
  return ms
}

function isOn(value) {
  if (value === undefined) return undefined
  if (typeof value === 'string') return !['false', '0', 'no'].includes(value.toLowerCase())
  return value === true
}

/**
 * `--no-pretty` 在 argv 里落成了 pretty=false，用 Map.has() 判定会把它读成「要求表格」，
 * 于是 Agent 显式要 JSON 却拿到人类表格（JSON.parse 直接失败）。必须按取值判定真假。
 */
function shouldPretty(flags, stdout) {
  const pretty = isOn(flags.get('pretty'))
  if (pretty === true) return true
  if (isOn(flags.get('json')) === true) return false
  if (pretty === false) return false
  // TTY 默认人类可读表格；管道/重定向（Agent 调用）默认 JSON
  return Boolean(stdout && stdout.isTTY)
}

/**
 * CLI 入口。
 * @param {string[]} argv 不含 node 与脚本名
 * @param {NodeJS.ProcessEnv} env
 * @param {{stdout?:NodeJS.WritableStream, stderr?:NodeJS.WritableStream}} io
 * @returns {Promise<number>} exit code
 */
export async function run(argv, env = process.env, io = {}) {
  const stdout = io.stdout || process.stdout
  const stderr = io.stderr || process.stderr
  const { positionals, flags, multi } = parseArgs(argv)
  const pretty = shouldPretty(flags, stdout)

  try {
    if ((positionals.length === 0 && flags.get('version') === true) || (positionals.length === 1 && positionals[0] === 'version')) {
      printSuccess(stdout, { name: 'cloudhouse-admin-cli', version: VERSION }, { pretty })
      return EXIT.OK
    }
    // `ch candidates list --help` 的目标就是 positionals 本身；早先无条件 slice(1)
    // 会把命令词切掉，只剩 ['list'] → 打印「未找到命令：list」还 return 0。
    const helpRequested = flags.get('help') !== undefined && flags.get('help') !== false
    if (helpRequested || positionals.length === 0 || positionals[0] === 'help') {
      const target = helpRequested ? positionals : positionals[0] === 'help' ? positionals.slice(1) : []
      const help = renderHelp(target)
      stdout.write(`${help.text}\n`)
      if (help.missing) {
        throw usageError(`未找到命令：${target.join(' ')}`, '运行 ch help 查看全部命令')
      }
      return EXIT.OK
    }

    const globals = {
      pretty,
      profile: typeof flags.get('profile') === 'string' ? flags.get('profile') : undefined,
      baseUrl: typeof flags.get('base-url') === 'string' ? flags.get('base-url') : undefined,
    }
    const command = resolveCommand(positionals)
    if (!command) {
      throw usageError(`未知命令：${positionals.join(' ')}`, '运行 ch help 查看全部命令')
    }
    const { key, spec, args } = command
    // 只有 backend/aicoding 读 body.requestId 并做去重，其它端点的审计 requestId 由服务端
    // 自己生成（AdminInterviewAuditContext）。过去非 AI 命令把它静默丢弃，而文档承诺
    // 「所有写操作幂等」，Agent 照文档重放超时/5xx 的写就会重复录入——静默接受比报错更危险。
    if (flags.get('request-id') !== undefined && spec.requestId !== true) {
      throw usageError(
        '--request-id 只被 ch ai * 的写操作支持',
        '其余端点不读取该字段，重放保护请依赖幂等的读接口或在应用层去重；直接去掉 --request-id 即可执行',
      )
    }
    for (const warning of checkFlags({ entries: [...flags.entries()], spec, positionals: args })) {
      stderr.write(`警告：${warning}\n`)
    }
    const config = resolveConfig({ flags: globals, env })

    const savedSession = spec.auth === false ? null : sessionStore.loadSession(env)
    const envToken = typeof env.CH_TOKEN === 'string' ? env.CH_TOKEN.trim() : ''
    let token = envToken || (savedSession && savedSession.token) || null

    // 「会话文件坏了」和「从没登录过」的处置方式完全不同：前者修文件，后者只需要 login。
    // 过去两者都报 NOT_LOGGED_IN，用户反复登录也反复被同一个坏文件挡住。
    if (!token && spec.auth !== false) {
      const damage = sessionStore.describeSessionDamage(env)
      if (damage) {
        throw new CliError({
          code: 'SESSION_DAMAGED',
          message: `本地会话文件不可用：${damage.file}（${damage.reason}）`,
          exitCode: EXIT.AUTH,
          hint: '确认没有其它凭据来源后可删除该文件再执行 ch login；删除会丢弃当前会话',
        })
      }
    }
    // 会话只有一份 session.json，不按 profile 分文件：`ch login --profile prod` 之后
    // 裸跑命令会默认 local，把生产 token 发到本地（或反过来）。这里比对登录时记录的
    // baseUrl，不一致默认拒绝；--allow-profile-mismatch 用于确实要跨环境的场景。
    if (!envToken && token && savedSession && typeof savedSession.baseUrl === 'string' && savedSession.baseUrl !== config.baseUrl) {
      if (flagOn({ flags }, 'allow-profile-mismatch')) {
        stderr.write(`提示：已用 --allow-profile-mismatch 放行跨环境会话。\n`)
      } else {
        throw usageError(`本地会话来自 ${savedSession.baseUrl}，目标为 ${config.baseUrl}；已阻止跨环境发送 Bearer Token`, '重新登录目标环境，或确认后显式加 --allow-profile-mismatch')
      }
    }

    const client = createClient({
      baseUrl: config.baseUrl,
      timeoutMs: resolveTimeoutMs(flags),
      // 未登录延迟到真正要发请求时才判定：命令体的本地参数校验在此之前完成，
      // 用法错误（2）才不会被鉴权错误（3）掩盖——否则 `ch candidates list --page abc`
      // 在未登录时永远只报「请先登录」，调用方看不到 --page 才是错的。
      getAuthHeaders: () => {
        if (!token) {
          throw new CliError({
            code: 'NOT_LOGGED_IN',
            message: '尚未登录：未找到本地会话（~/.config/cloudhouse-cli/session.json）且未设置 CH_TOKEN',
            exitCode: EXIT.AUTH,
            hint: '先执行 ch login，或为 Agent 场景设置 CH_TOKEN 环境变量',
          })
        }
        return { Authorization: `Bearer ${token}` }
      },
      onRenewal: (sentToken, renewedToken, expiresAt) => {
        if (token === sentToken) token = renewedToken
        try {
          sessionStore.absorbRenewal(env, sentToken, renewedToken, expiresAt)
        } catch {
          /* 续期落盘失败不阻断命令；下次仍可用旧 token 直至绝对上限 */
        }
      },
    })

    const ctx = {
      key,
      client,
      config,
      flags,
      multi,
      positionals: args,
      pretty,
      env,
      session: savedSession,
      token,
      stdout,
      stderr,
      log: (message) => stderr.write(`${message}\n`),
      setToken: (next) => {
        token = next
      },
    }

    const data = await spec.run(ctx)
    printSuccess(stdout, data, { pretty })
    return EXIT.OK
  } catch (err) {
    printFailure(stdout, stderr, err)
    if (err instanceof CliError) return err.exitCode
    return EXIT.BUSINESS
  }
}
