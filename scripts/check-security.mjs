import fs from 'node:fs'
import path from 'node:path'
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['cloud-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['provider-key', /\bsk-[A-Za-z0-9_-]{32,}\b/],
  ['deployment-detail', /root@\d+\.\d+\.\d+\.\d+|\/Users\/[A-Za-z0-9._-]+\/|\/www\/(?:apps|wwwroot|server)\//],
]
const findings = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue
    const name = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) { findings.push({ file: name, rule: 'symlink' }); continue }
    if (entry.isDirectory()) walk(name)
    else {
      if (/^(?:\.env(?:\..*)?|session\.json)$/.test(entry.name) || /\.(?:tgz|zip|sql|sqlite|pem|key|jsonl)$/.test(entry.name)) findings.push({ file: name, rule: 'private-or-generated-file' })
      if (name.endsWith('check-security.mjs')) continue // This file defines detector patterns, not credentials.
      const content = fs.readFileSync(name, 'utf8')
      for (const [rule, regex] of rules) if (regex.test(content)) findings.push({ file: name, rule })
    }
  }
}
walk('.')
console.log(JSON.stringify({ filesChecked: true, findings }, null, 2))
if (findings.length) process.exitCode = 1
