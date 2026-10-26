import { describe, expect, it } from 'vitest'
import { shortenPaths, toHtml, toMarkdown, turnsOf, type ExLine } from './sessionexport'

const KEY = 'sk-ant-api03-' + 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe9Dc8Ba7'
const GH = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
const lines: ExLine[] = [
  { kind: 'user', text: `Use my key ${KEY} in /Users/yuji/code/acme/src/env.ts` },
  { kind: 'tool', name: 'Read', summary: '/Users/yuji/code/acme/src/env.ts' },
  { kind: 'assistant', text: `Done. I put it in /Users/yuji/code/acme/.env and the token ${GH} too.` },
  { kind: 'shell', command: 'cat /home/bob/.netrc', out: `password ${GH}\n\`\`\`\n`, code: 1 },
  { kind: 'user', text: 'second' },
  { kind: 'assistant', text: 'ok' },
]
const o = { from: 0, to: 9, tools: true, cwd: '/Users/yuji/code/acme', home: '/Users/yuji' }

describe('session export', () => {
  it('masks every credential and shortens paths', () => {
    const r = toMarkdown(lines, o)
    expect(r.text).not.toContain(KEY)
    expect(r.text).not.toContain(GH)
    expect(r.text).not.toMatch(/\/Users\/yuji|\/home\/bob/)
    expect(r.text).toContain('./src/env.ts')
    expect(r.masked).toBeGreaterThanOrEqual(3)
    expect(r.text).toContain('(exit 1)')
    expect(r.text).toContain('````text')
  })
  it('exports a range of turns, tools optional', () => {
    const r = toMarkdown(lines, { ...o, from: 1, to: 1, tools: false })
    expect(r.turns).toBe(1)
    expect(r.text).toContain('## Turn 2')
    expect(r.text).not.toContain('Turn 1')
    expect(turnsOf(lines)).toHaveLength(2)
  })
  it('makes a page with no scripts', () => {
    const h = toHtml(lines, o).text
    expect(h).not.toMatch(/<script|src=|href=/)
    expect(h).not.toContain(KEY)
    expect(h).toContain('&lt;')
  })
  it('shortens other homes and windows paths', () => {
    expect(shortenPaths('see /home/ana/x and C:\\Users\\ana\\y', '', '')).toBe('see ~/x and ~\\y')
  })
})

describe('the same key twice', () => {
  it('is masked everywhere', () => {
    const k = 'sk-ant-api03-' + 'Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe9Dc8Ba7'
    const r = toMarkdown([{ kind: 'user', text: `${k} and again ${k}` }], { from: 0, to: 0, tools: false, cwd: '', home: '' })
    expect(r.text).not.toContain(k)
  })
})
