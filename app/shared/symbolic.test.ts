import { describe, expect, it } from 'vitest'
import { eligible, kindOf, pack, summarize, textOf } from './symbolic'

const LOG = [...Array.from({ length: 400 }, (_, i) => `2026-10-26 INFO request ${i} path=/api/items status=200 took ${i % 90} ms`), 'WARN slow query on orders', 'ERROR db refused connection on port 5432', 'ERROR db refused connection on port 5432', 'done in 4.2s'].join('\n')
const DIFF = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1,3 +1,4 @@', '-old', '+new', '+more', 'diff --git a/src/b.ts b/src/b.ts', '--- a/src/b.ts', '+++ b/src/b.ts', '@@ -1 +1 @@', '-x', '+y'].join('\n')

describe('short-term compression', () => {
  it('tells the kinds apart', () => {
    expect(kindOf(LOG)).toBe('log')
    expect(kindOf(DIFF)).toBe('diff')
    expect(kindOf(JSON.stringify({ items: [{ id: 1, name: 'a' }], total: 1 }))).toBe('json')
    expect(kindOf(Array.from({ length: 50 }, (_, i) => `src/mod${i % 3}/file${i}.ts`).join('\n'))).toBe('listing')
  })
  it('summarizes by rules for each kind', () => {
    expect(summarize('log', LOG)).toContain('Errors (1 distinct): ERROR db refused connection on port 5432.')
    expect(summarize('log', LOG)).toContain('1 warning line')
    expect(summarize('log', LOG)).toContain('Ends with:')
    expect(summarize('diff', DIFF)).toBe('Diff of 2 files, +3 -2: src/a.ts, src/b.ts.')
    expect(summarize('json', JSON.stringify({ items: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }], total: 2 }))).toBe('JSON, object with items, total. items: array of 2 objects with id, name.')
  })
  it('packs a long result into one symbolic line and leaves short or needed ones alone', () => {
    const p = pack('Bash', { command: 'npm run start' }, LOG, '.stm/outputs/t1.txt')!
    expect(p.line).toMatch(/^\[Bash "npm run start": 404 lines, \d+\.\d KB of log kept by the app at \.stm\/outputs\/t1\.txt\. Summary:/)
    expect(p.savedTokens).toBeGreaterThan(5000)
    expect(p.kept).toBeLessThan(600)
    expect(pack('Bash', {}, 'short', 'x')).toBeNull()
    expect(pack('Read', { file_path: 'a' }, LOG, 'x')).toBeNull()
    expect(eligible('mcp__code__run_code')).toBe(false)
    expect(eligible('mcp__github__list_issues')).toBe(true)
  })
  it('puts the line back in the shape the tool used, and the token count adds up', () => {
    const bash = textOf({ stdout: 'out', stderr: 'err', interrupted: false })!
    expect(bash.text).toBe('out\nerr')
    expect(bash.put('S')).toEqual({ stdout: 'S', stderr: '', interrupted: false })
    expect(textOf([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])!.put('S')).toEqual([{ type: 'text', text: 'S' }])
    expect(textOf({ mode: 'content', content: 'x' })!.put('S')).toEqual({ mode: 'content', content: 'S' })
    expect(textOf('plain')!.put('S')).toBe('S')
    expect(textOf({ image: 1 })).toBeNull()
    const p = pack('Bash', { command: 'x' }, LOG, 'f')!
    expect(p.savedTokens).toBe(Math.round((p.chars - p.kept) / 4))
  })
})
