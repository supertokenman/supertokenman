import { describe, expect, it } from 'vitest'
import { compact, cut, expand, LOSSLESS } from './compact'

const log = ['start', ...Array(40).fill('WARN retrying connection to db'), 'ok'].join('\n')
const rows = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item ${i}`, ok: i % 2 === 0, price: i * 1.5 })))

describe('compactor', () => {
  it('shrinks repeats and JSON arrays and gives the exact text back', () => {
    for (const t of [log, rows, `intro\n${rows}\nend`]) {
      const r = compact(t, { stages: LOSSLESS })
      expect(r.after).toBeLessThan(r.before)
      expect(expand(r.text)).toBe(t)
    }
  })
  it('never touches code blocks or diffs', () => {
    const code = '```js\n' + Array(10).fill('x()').join('\n') + '\n```'
    const diff = 'diff --git a/x b/x\n@@ -1 +1 @@\n' + Array(5).fill('+same').join('\n')
    expect(compact(code, { stages: LOSSLESS }).text).toBe(code)
    expect(compact(diff, { stages: LOSSLESS }).text).toBe(diff)
    expect(compact(`a\n${code}\nb`, { stages: LOSSLESS }).text).toContain(code)
  })
  it('replaces a paragraph already sent in the panel, and brings it back', () => {
    const p = 'The project uses pnpm workspaces with three packages: web, api and shared. '.repeat(4)
    const seen = new Map<string, string>()
    compact(p, { stages: ['dedup'] }, seen)
    const second = compact(`${p}\n\nnew part`, { stages: ['dedup'] }, seen)
    expect(second.text).toMatch(/^\[same as block \w+, sent earlier in this panel\]\n\nnew part$/)
    expect(expand(second.text, seen)).toBe(`${p}\n\nnew part`)
  })
  it('cuts only when asked, and says so', () => {
    const long = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n')
    expect(compact(long, { stages: LOSSLESS }).text).toBe(long)
    const c = cut(long, 100)
    expect(c.split('\n')).toHaveLength(101)
    expect(c).toContain('[... 200 lines left out by the compactor ...]')
  })
  it('keeps a JSON array it cannot turn back exactly', () => {
    const nested = JSON.stringify([{ a: { b: 1 } }, { a: { b: 2 } }, { a: { b: 3 } }])
    expect(compact(nested, { stages: ['json'] }).text).toBe(nested)
  })
})
