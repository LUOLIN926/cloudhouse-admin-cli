import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION } from '../src/version.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n') }
for (const name of ['00-overview', '01-command-reference', '02-agent-contract', '03-agent-setup', '04-audit', '05-release', '06-coverage', '07-data-analysis']) {
  const publicSource = path.join(root, 'opensource/docs', `${name}.md`)
  const source = fs.existsSync(publicSource) ? publicSource : path.join(root, 'docs', `${name}.md`)
  // Public docs already live inside this repository.
}
for (const name of ['01-command-reference', '02-agent-contract', '07-data-analysis']) write(path.join(root, 'skills/cloudhouse-admin/references', `${name}.md`), fs.readFileSync(path.join(root, 'docs', `${name}.md`), 'utf8'))
for (const agent of ['codex', 'dsh', 'opencode', 'openclaw', 'pi']) {
  const out = path.join(root, 'integrations', agent)
  fs.mkdirSync(out, { recursive: true })
  fs.cpSync(path.join(root, 'skills/cloudhouse-admin'), path.join(out, 'skills/cloudhouse-admin'), { recursive: true })
  write(path.join(out, 'README.md'), `# CloudHouse Admin — ${agent}\n\n安装 CLI 后运行 \`ch agent install ${agent} --scope user\` 或 \`--scope project\`。\n\n凭据只由本机 CLI 会话或环境提供；本包不含凭据。详见 https://dayunwu.cn/cli/#agents 。\n` + (agent === 'dsh' ? '\n本地 Cordis 配置示例：\n\n```yaml\n- id: cloudhouse-admin\n  name: /absolute/path/to/dsh/index.mjs\n```\n\n在桌面插件管理器导入本目录插件并启用。该插件需要宿主 skills 服务；由模型的 skill 工具发现 cloudhouse-admin，然后通过宿主终端调用 ch。\n' : ''))
  write(path.join(out, 'package.json'), { name: `cloudhouse-admin-${agent}`, version: VERSION, type: 'module', private: true, license: 'MIT', license: 'MIT', ...(agent === 'pi' ? { keywords: ['pi-package'], pi: { skills: ['./skills'] } } : {}), ...(agent === 'dsh' ? { main: './index.mjs', exports: './index.mjs', peerDependencies: { '@deepseek-ai/cordis': '>=4' } } : {}) })
  if (agent === 'codex') {
    const presentation = { displayName: 'CloudHouse Admin', shortDescription: '用 CLI 管理招新、面试与 AI Coding', websiteURL: 'https://dayunwu.cn/', logo: './assets/logo.png', composerIcon: './assets/logo.png' }
    fs.mkdirSync(path.join(out, 'assets'), { recursive: true })
    fs.copyFileSync(path.join(root, 'assets/codex-logo.png'), path.join(out, 'assets/logo.png'))
    write(path.join(out, 'plugin.json'), { '$schema': 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'cloudhouse-admin', version: VERSION, description: 'CloudHouse 管理后台 CLI 原生技能', homepage: 'https://dayunwu.cn/', extensions: { 'com.openai': { skills: './skills/', interface: presentation } } })
    write(path.join(out, '.codex-plugin/plugin.json'), { name: 'cloudhouse-admin', version: VERSION, description: 'CloudHouse 管理后台 CLI 原生技能', skills: './skills/', interface: presentation })
    write(path.join(out, '.agents/plugins/marketplace.json'), { name: 'cloudhouse-admin-local', interface: { displayName: 'CloudHouse Admin' }, plugins: [{ name: 'cloudhouse-admin', category: 'Productivity', source: { source: 'local', path: './' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } }] })
  }
  if (agent === 'dsh') write(path.join(out, 'index.mjs'), `import fs from 'node:fs'\nimport { fileURLToPath } from 'node:url'\nexport const name = 'cloudhouse-admin'\nexport const inject = ['skills']\nexport function apply(ctx) {\n  ctx.skills.register({ name, description: '通过 ch CLI 管理 CloudHouse 招新后台', content: fs.readFileSync(new URL('./skills/cloudhouse-admin/SKILL.md', import.meta.url), 'utf8'), source: 'bundled', invocation: { modelInvocable: true, userInvocable: true }, resourceBase: { kind: 'directory', path: fileURLToPath(new URL('./skills/cloudhouse-admin/', import.meta.url)) } })\n}\n`)
}

for (const agent of ['codex','dsh','opencode','openclaw','pi']) fs.copyFileSync(path.join(root,'LICENSE'),path.join(root,'integrations',agent,'LICENSE'))

for (const agent of ['codex','dsh','opencode','openclaw','pi']) fs.copyFileSync(path.join(root,'LICENSE'),path.join(root,'integrations',agent,'LICENSE'))
