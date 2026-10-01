import { getRegistry } from './commands/index.mjs'
import { supportedFlags, usageLines } from './flags.mjs'
import { VERSION } from './version.mjs'

export function capabilities() {
  return { version: VERSION, schemaVersion: 1, defaultProfile: 'local', productionBaseUrl: 'https://api.dayunwu.cn/api', commands: [...getRegistry().values()].map(spec => ({
    name: spec.name, summary: spec.summary, usage: spec.usage,
    flags: [...supportedFlags(spec)].sort(), endpoints: spec.endpoints || [],
    effect: spec.name === 'api' ? 'dynamic' : (spec.endpoints || []).some(e => !e.startsWith('GET ')) ? 'write' : spec.localWrite ? 'local-write' : 'read',
    permission: spec.permission || (spec.auth === false ? 'public-or-local' : 'backend-admin-authorization'),
    requestId: Boolean(spec.requestId), backendRequirement: spec.backendRequirement || null,
    actions: usageLines(spec).length > 1 ? usageLines(spec).map(line => {
      const action = line.slice(`ch ${spec.name} `.length).split(' ')[0]
      const read = ['list', 'get', 'get-generation'].includes(action)
      return { name: action, effect: read ? 'read' : 'write', flags: [...supportedFlags(spec, [action])].sort(), requestId: Boolean(spec.requestId && !read) }
    }) : undefined,
  })) }
}
