import { register, getRegistry } from './index.mjs'
import { usageError, EXIT, CliError } from '../errors.mjs'
import { flagOn } from '../payload.mjs'
import * as sessionStore from '../session.mjs'
import { decodeTokenExpiry, sessionExpiryState, promptPassword, promptText } from '../prompt.mjs'

register('login', {
  summary: '登录并保存会话（token 落盘 0600，含滚动续期自动换存）',
  usage: 'ch login [--studentNo <学号>] [--password <密码>] [--profile local|prod] [--show-token]',
  endpoints: ['POST /auth/login'],
  auth: false,
  run: async (ctx) => {
    const flagStudentNo = typeof ctx.flags.get('studentNo') === 'string' ? ctx.flags.get('studentNo') : ''
    const envStudentNo = typeof ctx.env.CH_STUDENT_NO === 'string' ? ctx.env.CH_STUDENT_NO.trim() : ''
    let studentNo = (flagStudentNo || envStudentNo).trim()
    if (!studentNo && process.stdin.isTTY) studentNo = (await promptText('学号：')).trim()
    if (!studentNo) {
      throw usageError('缺少学号', '用 --studentNo <学号> 或环境变量 CH_STUDENT_NO 提供')
    }

    let password = typeof ctx.flags.get('password') === 'string' ? ctx.flags.get('password') : ''
    if (!password && typeof ctx.env.CH_PASSWORD === 'string') password = ctx.env.CH_PASSWORD
    if (!password) {
      if (process.stdin.isTTY) {
        password = await promptPassword('密码（输入不回显）：')
      } else {
        throw usageError('非交互环境缺少密码', '用 --password 或环境变量 CH_PASSWORD 提供（避免写入 shell 历史）')
      }
    }
    if (!password) throw usageError('密码不能为空')

    const { data } = await ctx.client.request({
      method: 'POST',
      path: '/auth/login',
      body: { studentNo, password },
      noAuth: true,
    })
    if (!data || typeof data.token !== 'string') {
      throw new CliError({ code: 'LOGIN_FAILED', message: '登录响应缺少 token', exitCode: EXIT.BUSINESS })
    }

    const session = {
      version: 1,
      profile: ctx.config.profile,
      baseUrl: ctx.config.baseUrl,
      token: data.token,
      userId: data.userId ?? null,
      studentNo: data.studentNo ?? studentNo,
      role: data.role ?? null,
      expiresAt: decodeTokenExpiry(data.token),
      savedAt: Date.now(),
    }
    const file = sessionStore.saveSession(ctx.env, session)

    const result = {
      loggedIn: true,
      userId: session.userId,
      studentNo: session.studentNo,
      role: session.role,
      tokenExpiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
      profile: ctx.config.profile,
      baseUrl: ctx.config.baseUrl,
      sessionFile: file,
    }
    if (flagOn(ctx, 'show-token')) result.token = data.token
    ctx.log(`会话已保存至 ${file}（权限 0600；续期由后端 X-Renewed-Token 自动换存）`)
    return result
  },
})

register('whoami', {
  summary: '查看当前会话与管理员权限（adminLevel / authorizedGroups）',
  usage: 'ch whoami',
  endpoints: ['GET /admin/profile'],
  run: async (ctx) => {
    const { data: profile } = await ctx.client.request({ method: 'GET', path: '/admin/profile' })
    const session = ctx.session || sessionStore.loadSession(ctx.env)
    const expiresAt = typeof session?.expiresAt === 'number' ? session.expiresAt : decodeTokenExpiry(ctx.token)
    const state = sessionExpiryState(expiresAt)
    return {
      session: {
        userId: session?.userId ?? null,
        studentNo: session?.studentNo ?? null,
        role: session?.role ?? null,
        profile: ctx.config.profile,
        baseUrl: ctx.config.baseUrl,
        tokenSource: ctx.env.CH_TOKEN ? 'CH_TOKEN 环境变量' : session ? '本地会话文件' : '无',
        tokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        tokenState: state,
      },
      profile,
    }
  },
})

register('logout', {
  summary: '删除本地会话文件（不影响服务端 token，直至自然过期）',
  usage: 'ch logout',
  endpoints: [],
  auth: false,
  localWrite: true,
  run: async (ctx) => {
    const cleared = sessionStore.clearSession(ctx.env)
    return { loggedOut: true, sessionFileRemoved: cleared }
  },
})

const identity = getRegistry().get('whoami')
register('auth status', { ...identity, name: 'auth status', usage: 'ch auth status' })
