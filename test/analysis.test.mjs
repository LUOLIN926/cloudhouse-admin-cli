import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'
const env = { CH_TOKEN: makeFakeToken(Math.floor(Date.now() / 1000) + 86400), CH_CONFIG_DIR: '/nonexistent-analysis-config' }
async function setup(t, handler) { const server = await startMockServer(handler); t.after(() => server.close()); return server }
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-analysis-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir }

test('analysis validates resource, ID, filters, size, output and permission arguments before requests', async t => {
  let calls = 0; const server = await setup(t, () => { calls++; return { json: { code: 200, data: null } } })
  for (const args of [
    ['analysis', 'list', 'not-a-resource'], ['analysis', 'list', 'users', '--size', '501'],
    ['analysis', 'list', 'users', '--filters', '{"password":"x"}'], ['analysis', 'list', 'users', '--filters', '{"role":"2 OR 1=1"}'],
    ...[['constructor', 'x'], ['toString', 'x'], ['__proto__', 'x']].map(([key, value]) => ['analysis', 'list', 'users', '--filters', JSON.stringify({ [key]: value })]),
    ['analysis', 'list', 'users', '--filters', '[]'], ['analysis', 'get', 'users', '0'],
    ['analysis', 'get', 'users', '1', 'extra'], ['analysis', 'download', '../secret', '--out', 'file'],
    ['accounts', 'analysis-permission', '2', '--enabled', 'maybe', '--version', '1'],
    ['accounts', 'analysis-permission', '2', '--enabled', 'true', '--version', '-1'],
  ]) assert.equal((await runCli(args, { baseUrl: server.baseUrl, env })).code, 2, args.join(' '))
  assert.equal(calls, 0)
})
test('analysis emits actual requests and version-locked SYSTEM authorization updates', async t => {
  const requests = []; const server = await setup(t, request => { requests.push(request); return { json: { code: 200, data: { enabled: true, version: 2 } } } })
  for (const args of [['analysis','resources'], ['analysis','list','users','--filters','{"role":2}'], ['analysis','get','profiles','5'], ['accounts','analysis-permission','2','--enabled','true','--version','1'], ['auth','status']])
    assert.equal((await runCli(args, { baseUrl: server.baseUrl, env })).code, 0)
  assert.equal(requests[1].query.get('filters'), '{"role":2}')
  assert.equal(requests[1].query.get('size'), '100')
  assert.deepEqual(requests[3].body, { enabled: true, version: 1 })
  assert.equal(requests[4].path, '/api/admin/profile')
})
test('export writes JSONL atomically, renews token for following pages and retains bounded metadata', async t => {
  const dir = temporary(t), out = path.join(dir, 'data.jsonl'); const requests = []
  const server = await setup(t, request => {
    requests.push(request); const cursor = request.query.get('cursor')
    return { headers: cursor ? {} : { 'X-Renewed-Token': 'renewed-token' }, json: { code: 200, data: { resource: 'users', items: [{ id: cursor ? 2 : 1 }], upperBound: '2', nextCursor: cursor ? null : 'next' } } }
  })
  const result = await runCli(['analysis','export','users','--out',out], { baseUrl: server.baseUrl, env })
  assert.equal(result.code, 0, result.stdout)
  assert.equal(fs.readFileSync(out,'utf8'), '{"id":1}\n{"id":2}\n')
  assert.equal(requests[1].headers.authorization, 'Bearer renewed-token')
  assert.equal(JSON.parse(result.stdout).data.records, 2)
  assert.deepEqual(fs.readdirSync(dir), ['data.jsonl'])
  assert.equal((await runCli(['analysis','export','users','--out',out], { baseUrl: server.baseUrl, env })).code, 2)
})
test('export removes partial files on mid-export revocation, invalid cursors or changed upper bound', async t => {
  for (const failure of ['revoke','repeat','upper']) {
    const dir=temporary(t), out=path.join(dir,'data.jsonl'); let count=0
    const server=await setup(t,()=>{
      count++
      if(count>1 && failure==='revoke') return {json:{code:403,message:'数据分析权限未开启'}}
      return {json:{code:200,data:{resource:'users',items:[{id:count}],upperBound:count>1 && failure==='upper'?'3':'2',nextCursor:'next'}}}
    })
    const result=await runCli(['analysis','export','users','--out',out],{baseUrl:server.baseUrl,env})
    assert.equal(result.code,failure==='revoke'?4:1,result.stdout)
    assert.deepEqual(fs.readdirSync(dir),[])
  }
})
test('download saves authenticated bytes; 200 JSON permission denial and HTML never become files',async t=>{
  const dir=temporary(t),out=path.join(dir,'paper.pdf'),id='ai-'+'a'.repeat(32)+'.pdf'
  const good=await setup(t,()=>({raw:'%PDF-test',headers:{'Content-Type':'application/pdf'}}))
  assert.equal((await runCli(['analysis','download',id,'--out',out],{baseUrl:good.baseUrl,env})).code,0)
  assert.equal(fs.readFileSync(out,'utf8'),'%PDF-test');fs.unlinkSync(out)
  for(const reply of [{json:{code:403,message:'denied'}},{raw:'<html>login</html>',headers:{'Content-Type':'text/html'}}]){
    const bad=await setup(t,()=>reply); const result=await runCli(['analysis','download',id,'--out',out],{baseUrl:bad.baseUrl,env})
    assert.notEqual(result.code,0);assert.equal(fs.existsSync(out),false)
  }
})
