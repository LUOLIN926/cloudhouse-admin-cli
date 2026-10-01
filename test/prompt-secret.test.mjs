import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough, Writable } from 'node:stream'
import { promptPassword } from '../src/prompt.mjs'

test('TTY 密码输入只输出提示和换行，readline 不回显密码', async () => {
  const input=new PassThrough()
  let visible=''
  const output=new Writable({write(chunk,_encoding,done){visible+=chunk.toString();done()}})
  const answer=promptPassword('密码：',{input,output})
  input.write('fake-test-secret\r')
  assert.equal(await answer,'fake-test-secret')
  assert.equal(visible,'密码：\n')
  input.end();output.end()
})
