import { describe, expect, it } from 'vitest'
import { citeCheck, citesOf, sourceLabel, splitCites, type Source } from './citations'

const s = (n: number): Source => ({ n, doc: 1, chunk: n, title: 'API guide', tag: 'api', text: 'x' })
describe('citations', () => {
  it('reads marks in order of first use', () => {
    expect(citesOf('Rate limit is 100 [S2]. Auth is OAuth [S1][S2].')).toEqual([2, 1])
  })
  it('flags no citation, unknown marks, and accepts an honest no', () => {
    expect(citeCheck('The limit is 100.', [s(1)])).toMatch(/cites no source/)
    expect(citeCheck('The limit is 100 [S4].', [s(1)])).toMatch(/\[S4\]/)
    expect(citeCheck('The limit is 100 [S1].', [s(1)])).toBeNull()
    expect(citeCheck('The sources do not say what the limit is.', [s(1)])).toBeNull()
    expect(citeCheck('anything', [])).toBeNull()
  })
  it('labels and splits', () => {
    expect(sourceLabel(s(3))).toBe('[S3] @api: API guide')
    expect(splitCites('a [S1] b')).toEqual(['a ', { n: 1 }, ' b'])
  })
})
