import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMockServer, runCli, makeFakeToken } from '../test-support/mock-server.mjs'
import { installAgent } from '../src/agent-install.mjs'
const token = makeFakeToken(Math.floor(Date.now()/1000)+86400)
const env = { CH_TOKEN: token, CH_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ch-extended-')) }
async function server(t, handler) { const s = await startMockServer(handler); t.after(() => s.close()); return s }

test('新增管理接口：全部六个请求真实触达正确路径与载荷', async t => {
  const seen=[]
  const mock=await server(t, r => {seen.push(r);return {json:{code:200,data:[]}}})
  for (const args of [ ['second-round-choices','page','--page','2','--size','25'], ['slots','attendance','7'], ['feishu','deliveries','--status','FAILED'], ['feishu','requeue','--ids','7,8'], ['feishu','backfill-absence'], ['feishu','refresh-document'] ]) {
    const r=await runCli(args,{baseUrl:mock.baseUrl,env}); assert.equal(r.code,0,r.stdout)
  }
  assert.deepEqual(seen.map(r=>`${r.method} ${r.path}`),['GET /api/admin/second-round-choices/page','GET /api/admin/interview-slots/7/attendance','GET /api/admin/feishu/deliveries','POST /api/admin/feishu/deliveries/requeue','POST /api/admin/feishu/notifications/backfill-today-absence','POST /api/admin/feishu/upcoming-slots-document/refresh'])
  assert.equal(seen[0].query.get('size'),'25');assert.equal(seen[2].query.get('status'),'FAILED');assert.deepEqual(seen[3].body,{ids:[7,8]})
  for (const args of [['feishu','requeue'],['feishu','requeue','--ids','x'],['feishu','requeue','--all','--ids','7']]) assert.equal((await runCli(args,{baseUrl:mock.baseUrl,env})).code,2)
  assert.equal(seen.length,6)
  assert.equal((await runCli(['feishu','requeue','--all'],{baseUrl:mock.baseUrl,env})).code,0);assert.deepEqual(seen.at(-1).body,{ids:[]})
})
test('新增接口权限拒绝、功能关闭、未实现仍遵守退出码', async t => {
  for (const [code,expected] of [[403,4],[404,9]]) {
    const mock=await server(t,()=>({json:{code,message:'拒绝'}}))
    assert.equal((await runCli(['feishu','deliveries'],{baseUrl:mock.baseUrl,env})).code,expected)
  }
  const mock=await server(t,()=>({status:503,json:{code:503,message:'disabled',data:{reasonCode:'FEATURE_DISABLED'}}}))
  assert.equal((await runCli(['ai','materials','get','a'.repeat(32)+'.md'],{baseUrl:mock.baseUrl,env})).code,8)
})
test('资料：multipart上传、预览、文件边界及上传不支持requestId', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ch-materials-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const file=path.join(dir,'task.md');fs.writeFileSync(file,'# 模拟任务')
  const seen=[];const mock=await server(t,r=>{seen.push(r);return {json:{code:200,data:{id:'a'.repeat(32)+'.md'}}}})
  assert.equal((await runCli(['ai','materials','upload',file],{baseUrl:mock.baseUrl,env})).code,0)
  assert.match(seen[0].headers['content-type'],/multipart/);assert.match(seen[0].rawBody,/# 模拟任务/)
  assert.equal((await runCli(['ai','materials','get','a'.repeat(32)+'.md'],{baseUrl:mock.baseUrl,env})).code,0)
  for(const bytes of [Buffer.alloc(262145),Buffer.from([0xff]),Buffer.from(''),Buffer.from('x\0y')]) {
    fs.writeFileSync(file,bytes);assert.equal((await runCli(['ai','materials','upload',file],{baseUrl:mock.baseUrl,env})).code,2)
  }
  assert.equal((await runCli(['ai','materials','upload',file,'--request-id','rid'],{baseUrl:mock.baseUrl,env})).code,2)
  assert.equal(seen.length,2)
})
test('出题：版本冲突重读换requestId、续期即时用于后续请求、查询与确认',async t=>{
  const seen=[];let writes=0
  const mock=await server(t,r=>{
    seen.push(r)
    if(r.method==='GET'&&r.path==='/api/admin/ai-coding/plans/3')return {headers:{'X-Renewed-Token':'renewed'},json:{code:200,data:{version:writes?2:1}}}
    if(r.path.endsWith('/generations')&&++writes===1)return {status:409,json:{code:409,message:'conflict',data:{reasonCode:'VERSION_CONFLICT'}}}
    return {json:{code:200,data:{jobId:8,status:'QUEUED'}}}
  })
  const r=await runCli(['ai','papers','generate','3','paper-a','--request-id','first'],{baseUrl:mock.baseUrl,env});assert.equal(r.code,0,r.stdout)
  const post=seen.filter(r=>r.method==='POST');assert.equal(post[0].headers.authorization,'Bearer renewed');assert.equal(post[0].body.requestId,'first');assert.notEqual(post[1].body.requestId,'first');assert.equal(post[1].body.version,2)
  assert.equal((await runCli(['ai','papers','get-generation','3','paper-a','8'],{baseUrl:mock.baseUrl,env})).code,0)
  assert.equal((await runCli(['ai','papers','confirm','3','paper-a','--version','2','--request-id','confirm'],{baseUrl:mock.baseUrl,env})).code,0)
  assert.ok(seen.some(r=>r.path.endsWith('/generations/8')));assert.equal(seen.at(-1).body.requestId,'confirm')
})
test('出题：显式version冲突不覆盖调用意图',async t=>{
  let calls=0;const mock=await server(t,()=>{calls++;return {status:409,json:{code:409,message:'conflict',data:{reasonCode:'VERSION_CONFLICT'}}}})
  assert.equal((await runCli(['ai','papers','confirm','3','paper-a','--version','1'],{baseUrl:mock.baseUrl,env})).code,6);assert.equal(calls,1)
})
test('响应：200 HTML/损坏JSON/错误信封不再误报成功，204仍可成功',async t=>{
  for(const raw of ['<html>login</html>','{bad','{"data":"no-code"}']){
    const mock=await server(t,()=>({raw}));const r=await runCli(['dashboard'],{baseUrl:mock.baseUrl,env});assert.equal(r.code,1);assert.equal(JSON.parse(r.stdout).error.code,'UNEXPECTED_RESPONSE')
  }
  const mock=await server(t,()=>({status:204}));assert.equal((await runCli(['dashboard'],{baseUrl:mock.baseUrl,env})).code,0)
})
test('请求：拒绝重定向，避免错误成功与意外转发',async t=>{
  let targetCalls=0;const target=await server(t,()=>{targetCalls++;return {json:{code:200,data:null}}})
  const source=await server(t,()=>({status:302,headers:{Location:target.baseUrl+'/admin/dashboard'}}))
  assert.equal((await runCli(['dashboard'],{baseUrl:source.baseUrl,env})).code,7);assert.equal(targetCalls,0)
})
test('严格参数：已知但不适用的flag、多余位置参数、AI读接口request-id不发请求',async t=>{
  let calls=0;const mock=await server(t,()=>{calls++;return {json:{code:200,data:null}}})
  for(const args of [['dashboard','--reason','ignored'],['ai','plans','get','3','--name','ignored'],['ai','plans','list','--request-id','ignored'],['ai','papers','get-generation','3','p','8','extra']]) assert.equal((await runCli(args,{baseUrl:mock.baseUrl,env})).code,2)
  assert.equal(calls,0)
})
test('五类agent安装：隔离目录、可更新、保留无关配置、不含凭据',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ch-agent-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  fs.writeFileSync(path.join(dir,'unrelated.json'),'keep')
  for(const agent of ['codex','dsh','opencode','openclaw','pi'])for(const scope of ['user','project']){
    const out=installAgent(agent,scope,{CH_AGENT_HOME:dir},dir)
    assert.ok(fs.existsSync(out.installedTo));assert.equal(out.credentialsIncluded,false)
    assert.deepEqual(installAgent(agent,scope,{CH_AGENT_HOME:dir},dir),out)
  }
  assert.equal(fs.readFileSync(path.join(dir,'unrelated.json'),'utf8'),'keep')
})
test('版本与能力离线可读，能力按动作声明幂等且标注后端要求',async()=>{
  const r=await runCli(['--version'],{env:{CH_CONFIG_DIR:'/does-not-exist'}});assert.equal(JSON.parse(r.stdout).data.version,'0.3.2')
  const caps=JSON.parse((await runCli(['capabilities'],{env:{CH_CONFIG_DIR:'/does-not-exist'}})).stdout).data
  const papers=caps.commands.find(s=>s.name==='ai papers');assert.ok(papers.backendRequirement);assert.equal(papers.actions.find(s=>s.name==='get-generation').requestId,false)
  assert.equal(caps.commands.find(s=>s.name==='ai materials').requestId,false)
})


test('Agent 安装：拒绝父目录和悬空目标符号链接，不改动外部文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-agent-safe-'))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-agent-outside-'))
  fs.symlinkSync(outside, path.join(dir, '.config'))
  assert.throws(() => installAgent('opencode', 'user', { CH_AGENT_HOME: dir }, dir), /符号链接/)
  assert.deepEqual(fs.readdirSync(outside), [])
  fs.unlinkSync(path.join(dir, '.config'))
  fs.mkdirSync(path.join(dir, '.config/opencode/skills'), { recursive: true })
  fs.symlinkSync(path.join(outside, 'missing'), path.join(dir, '.config/opencode/skills/cloudhouse-admin'))
  assert.throws(() => installAgent('opencode', 'user', { CH_AGENT_HOME: dir }, dir), /符号链接/)
  assert.deepEqual(fs.readdirSync(outside), [])
})
