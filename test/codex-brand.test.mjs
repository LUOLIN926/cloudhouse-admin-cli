import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { installAgent } from '../src/agent-install.mjs'
const root = fileURLToPath(new URL('../integrations/codex/', import.meta.url))
test('Codex metadata and installed assets remain consistent across updates', t => {
  const portable = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json')))
  const overlay = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin/plugin.json')))
  assert.deepEqual(portable.extensions['com.openai'].interface, overlay.interface)
  assert.equal(overlay.interface.websiteURL, 'https://dayunwu.cn/')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-brand-'))
  t.after(() => fs.rmSync(home, {recursive:true, force:true}))
  const first = installAgent('codex', 'user', {CH_AGENT_HOME:home})
  fs.writeFileSync(path.join(first.installedTo, 'unrelated.txt'), 'preserve')
  installAgent('codex', 'user', {CH_AGENT_HOME:home})
  assert.equal(fs.readFileSync(path.join(first.installedTo, 'unrelated.txt'), 'utf8'), 'preserve')
  for (const key of ['logo', 'composerIcon']) {
    const name = overlay.interface[key]
    assert.ok(name.startsWith('./assets/'))
    const expected = fs.readFileSync(path.join(root, name))
    assert.deepEqual(fs.readFileSync(path.join(first.installedTo, name)), expected)
    assert.equal(expected.readUInt32BE(16), 256)
    assert.equal(expected.readUInt32BE(20), 256)
  }
})
