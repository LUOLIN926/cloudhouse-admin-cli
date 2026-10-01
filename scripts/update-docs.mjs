import fs from 'node:fs'
import path from 'node:path'
import { getRegistry } from '../src/commands/index.mjs'
import { capabilities } from '../src/capabilities.mjs'
import { VERSION } from '../src/version.mjs'
import '../src/commands/load.mjs'
const dir = path.resolve('docs')
const overview = path.join(dir, '00-overview.md')
fs.writeFileSync(overview, fs.readFileSync(overview, 'utf8').replace(/版本 \*\*[\d.]+\*\*/, `版本 **${VERSION}**`).replace(/共 \d+ 条命令/, `共 ${getRegistry().size} 条命令`).replace(/cloudhouse-admin-cli-[\d.]+\.tgz/g, `cloudhouse-admin-cli-${VERSION}.tgz`))
let reference = `# CLI 命令参考（${VERSION}）\n\n由注册表生成；Agent 指定 \`--profile prod --json\`。\n\n全局：\`--profile\`、\`--base-url\`、\`--timeout\`、\`--pretty\`、\`--json\`、\`--no-pretty\`、\`--help\`、\`--allow-profile-mismatch\`；\`ch --version\` 离线输出版本。\`--request-id\` 只在 \`ch ai *\` 写命令上有效。支持 JSON 载荷的写命令可用 \`-d/--data\`；\`--request-id\` 只用于能力目录标注支持的动作。\n\n数据分析需要独立授权，参见 [数据分析指南](07-data-analysis.md)。\n`
for (const c of capabilities().commands) {
  reference += `\n## ch ${c.name}\n\n${c.summary}\n\n\`\`\`bash\n${Array.isArray(c.usage) ? c.usage.join('\n') : c.usage}\n\`\`\`\n\n`
  if (c.endpoints.length) reference += `接口：${c.endpoints.map(e => `\`${e}\``).join('、')}。\n\n`
  reference += `参数：${[...new Set([...c.flags, ...(c.actions || []).flatMap(action => action.flags)])].map(f => `\`${f.length === 1 ? '-' : '--'}${f}\``).join('、')}。未知、不适用参数及多余位置参数在请求前返回 exit 2。\n`
  if (c.backendRequirement) reference += `\n后端要求：${c.backendRequirement}。\n`
}
fs.writeFileSync(path.join(dir, '01-command-reference.md'), reference)
console.log(`Updated docs for ${getRegistry().size} registrations, CLI ${VERSION}`)
