import { register } from './index.mjs'
import { capabilities } from '../capabilities.mjs'
import { installAgent } from '../agent-install.mjs'
import { flagString } from '../payload.mjs'
import { usageError } from '../errors.mjs'
register('capabilities', { summary: '离线机器可读能力目录（含参数、读写、权限、幂等与后端要求）', usage: 'ch capabilities [--json]', auth: false, endpoints: [], run: async () => capabilities() })
register('agent install', {
  summary: '为 agent 安装原生技能/插件（仅本地，不含凭据）', usage: 'ch agent install <agent> [--scope user|project]', auth: false, localWrite: true, endpoints: [],
  run: async ctx => {
    if (ctx.positionals.length !== 1) throw usageError('用法：ch agent install <codex|dsh|opencode|openclaw|pi> --scope user|project')
    return installAgent(ctx.positionals[0], flagString(ctx, 'scope') || 'user', ctx.env)
  },
})
