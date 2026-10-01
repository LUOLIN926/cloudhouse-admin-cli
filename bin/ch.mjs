#!/usr/bin/env node
import { run } from '../src/cli.mjs'

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    process.stderr.write(`内部错误：${err && err.stack ? err.stack : String(err)}\n`)
    process.exitCode = 1
  })
