#!/usr/bin/env node
// A stand-in for officecli in tests: the README's commands and JSON envelopes, nothing more.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const [cmd, ...rest] = process.argv.slice(2)
const out = (o, code = 0) => (process.stdout.write(JSON.stringify(o) + '\n'), process.exit(code))
if (cmd === '--version') out({ version: process.env.FAKE_OC_VERSION ?? '1.0.140' })
const file = rest[0]
if (cmd === 'create') { writeFileSync(file, 'PK fake office file'); out({ success: true, path: '/' }) }
if (cmd === 'batch') {
  const cmds = JSON.parse(readFileSync(rest[rest.indexOf('--input') + 1], 'utf8'))
  const bad = cmds.findIndex((c) => c.path === '/bad')
  // atomic: one failing item leaves the file as it was
  if (bad >= 0) out({ success: false, error: { error: `Item ${bad + 1}: path not found`, code: 'not_found', suggestion: 'Valid paths: /body' } }, 1)
  writeFileSync(file, readFileSync(file, 'utf8') + '\n' + JSON.stringify(cmds))
  out({ success: true })
}
if (cmd === 'close') out({ success: true })
if (cmd === 'validate') out({ success: true })
if (cmd === 'view' && rest[1] === 'issues') out(readFileSync(file, 'utf8').includes('overflow') ? [{ message: 'Slide 1: text overflows shape 2' }] : [])
if (cmd === 'view' && rest[1] === 'screenshot') { writeFileSync(rest[rest.indexOf('-o') + 1], process.env.FAKE_OC_PNG ? readFileSync(process.env.FAKE_OC_PNG) : Buffer.from('89504e470d0a1a0a', 'hex')); out({ success: true }) }
out({ success: false, error: { error: `unknown ${cmd}` } }, 1)
