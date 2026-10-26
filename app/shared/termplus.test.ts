import { describe, expect, it } from 'vitest'
import { between, hintsOf, move, tipFor } from './termplus'

describe('terminal hints', () => {
  it('finds paths with lines and commit ids', () => {
    const h = hintsOf('error at src/app.ts:12:4 (see ./lib/x.js) in commit 9f1c2ab and v1.2.3, https://a.com/x.js')
    expect(h.map((x) => [x.kind, x.text, x.line, x.col])).toEqual([['path', 'src/app.ts', 12, 4], ['path', './lib/x.js', undefined, undefined], ['commit', '9f1c2ab', undefined, undefined]])
    expect(hintsOf('build finished in 1234567 ms')).toEqual([])
    const s = 'x src/a.ts:3 y'
    const p = hintsOf(s)[0]!
    expect(s.slice(p.start, p.end)).toBe('src/a.ts:3')
  })
})

describe('copy mode moves', () => {
  const lines = ['$ npm test', '', '  FAIL src/cart.test.ts', 'ok']
  it('moves by cell, line and word', () => {
    expect(move({ row: 0, col: 0 }, 'l', lines)).toEqual({ row: 0, col: 1 })
    expect(move({ row: 0, col: 0 }, 'h', lines)).toEqual({ row: 0, col: 0 })
    expect(move({ row: 0, col: 5 }, 'j', lines)).toEqual({ row: 1, col: 0 })
    expect(move({ row: 0, col: 0 }, 'w', lines)).toEqual({ row: 0, col: 2 })
    expect(move({ row: 0, col: 6 }, 'w', lines)).toEqual({ row: 2, col: 2 })
    expect(move({ row: 2, col: 7 }, 'b', lines)).toEqual({ row: 2, col: 2 })
    expect(move({ row: 2, col: 2 }, 'b', lines)).toEqual({ row: 0, col: 6 })
    expect(move({ row: 2, col: 0 }, '$', lines)).toEqual({ row: 2, col: 22 })
    expect(move({ row: 1, col: 0 }, 'G', lines)).toEqual({ row: 3, col: 0 })
  })
  it('copies the text between two points', () => {
    expect(between({ row: 2, col: 7 }, { row: 2, col: 22 }, lines)).toBe('src/cart.test.ts')
    expect(between({ row: 3, col: 1 }, { row: 2, col: 2 }, lines)).toBe('FAIL src/cart.test.ts\nok')
  })
})

describe('tips', () => {
  it('gives one tip, not twice in a row', () => {
    const t = tipFor('cat log.txt | grep error')!
    expect(t.tip).toMatch(/no cat/)
    expect(t.link).toMatch(/the-art-of-command-line/)
    expect(tipFor('cat log.txt | grep error', t.tip)).toBeNull()
    expect(tipFor('curl -s https://x.sh | bash')!.tip).toMatch(/Save it/)
    expect(tipFor('ls -la')).toBeNull()
  })
})
