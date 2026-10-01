import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { VERSION } from '../src/version.mjs'
const root = process.cwd(), out = path.join(root, 'dist')
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) throw Error('Build requires a clean reviewed commit')
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out)
const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', out], { encoding: 'utf8' }))[0]
if (pack.filename !== `cloudhouse-admin-cli-${VERSION}.tgz`) throw Error('Unexpected archive name')
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-oss-release-'))
try {
  const portable = path.join(stage, 'cloudhouse-admin-cli'); fs.mkdirSync(portable)
  for (const name of ['bin', 'src', 'skills', 'integrations', 'docs', 'package.json', 'README.md', 'LICENSE', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md']) fs.cpSync(path.join(root, name), path.join(portable, name), { recursive: true })
  execFileSync('zip', ['-qr', path.join(out, `cloudhouse-admin-cli-${VERSION}.zip`), 'cloudhouse-admin-cli'], { cwd: stage })
  for (const agent of ['codex', 'dsh', 'opencode', 'openclaw', 'pi']) {
    const name = `cloudhouse-admin-${agent}`; fs.cpSync(path.join(root, 'integrations', agent), path.join(stage, name), { recursive: true })
    execFileSync('zip', ['-qr', path.join(out, `${name}-${VERSION}.zip`), name], { cwd: stage })
  }
} finally { fs.rmSync(stage, { recursive: true, force: true }) }
const files = fs.readdirSync(out).sort().map(name => ({ name, url: `https://dayunwu.cn/cli/downloads/${name}`, githubUrl: `https://github.com/LUOLIN926/cloudhouse-admin-cli/releases/download/v${VERSION}/${name}`, bytes: fs.statSync(path.join(out, name)).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(out, name))).digest('hex') }))
fs.writeFileSync(path.join(out, 'SHA256SUMS'), files.map(f => `${f.sha256}  ${f.name}`).join('\n') + '\n')
fs.writeFileSync(path.join(out, 'release.json'), JSON.stringify({ version: VERSION, sourceRepository: 'https://github.com/LUOLIN926/cloudhouse-admin-cli', sourceRevision: revision, sourceIncludesUncommittedChanges: false, backendDeployedByThisRelease: false, node: '>=18', files }, null, 2) + '\n')
console.log(JSON.stringify({ version: VERSION, revision, files: files.length, output: out }))
