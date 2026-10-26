import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addReceipt, newKey, verify } from './receipts'

describe('tool receipts', () => {
  it('chains each call and finds the first edited line', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'rc-')), 'r.jsonl')
    const k = newKey()
    for (let i = 0; i < 4; i++) addReceipt(f, k, { panel: 's1', project: 'app', tool: 'Bash', input: { command: `echo ${i}` }, output: String(i) }, 1000 + i)
    expect(verify(f, k)).toEqual({ count: 4, brokenAt: null })
    expect(readFileSync(f, 'utf8')).not.toContain('echo')
    const lines = readFileSync(f, 'utf8').trimEnd().split('\n')
    lines[2] = lines[2]!.replace('"Bash"', '"Read"')
    writeFileSync(f, `${lines.join('\n')}\n`)
    expect(verify(f, k)).toEqual({ count: 4, brokenAt: 3 })
    expect(verify(f, newKey()).brokenAt).toBe(1)
  })
  it('notices a removed line', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'rc-')), 'r.jsonl')
    const k = newKey()
    for (let i = 0; i < 3; i++) addReceipt(f, k, { panel: 's1', project: 'app', tool: 'Read', input: {}, output: '' }, i)
    const lines = readFileSync(f, 'utf8').trimEnd().split('\n')
    writeFileSync(f, `${[lines[0], lines[2]].join('\n')}\n`)
    expect(verify(f, k)).toEqual({ count: 2, brokenAt: 2 })
  })
})
