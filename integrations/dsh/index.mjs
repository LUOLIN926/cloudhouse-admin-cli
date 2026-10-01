import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
export const name = 'cloudhouse-admin'
export const inject = ['skills']
export function apply(ctx) {
  ctx.skills.register({ name, description: '通过 ch CLI 管理 CloudHouse 招新后台', content: fs.readFileSync(new URL('./skills/cloudhouse-admin/SKILL.md', import.meta.url), 'utf8'), source: 'bundled', invocation: { modelInvocable: true, userInvocable: true }, resourceBase: { kind: 'directory', path: fileURLToPath(new URL('./skills/cloudhouse-admin/', import.meta.url)) } })
}
