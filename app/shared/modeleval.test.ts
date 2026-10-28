import { describe, expect, it } from 'vitest'
import { cheapest, combos, readCases, rows, table, type Run } from './modeleval'

describe('stm eval', () => {
  it('uses each model default effort unless efforts are asked', () => {
    expect(combos(['claude-sonnet-5-5'], undefined)).toEqual([{ model: 'claude-sonnet-5-5', effort: 'high' }])
    expect(combos(['claude-sonnet-5-5'], ['low', 'max'])).toEqual([
      { model: 'claude-sonnet-5-5', effort: 'low' },
      { model: 'claude-sonnet-5-5', effort: 'max' },
    ])
  })
  it('runs a model without effort levels once, and refuses unknown models', () => {
    expect(combos(['claude-haiku-4-5'], ['low'])).toEqual([{ model: 'claude-haiku-4-5', effort: null }])
    expect(() => combos(['gpt-9'], undefined)).toThrow(/Unknown model/)
  })
  it('says where to add cases when there are none', () => {
    expect(() => readCases('# only a comment')).toThrow(/\.supertokenman\/evals\.txt/)
    expect(readCases('Say hi | must: hi')).toHaveLength(1)
  })
  it('picks the cheapest setting that passed every case', () => {
    const all = combos(['claude-haiku-5-5', 'claude-sonnet-5-5'], undefined)
    const run = (i: number, pass: boolean, costUsd: number, id = 'E1'): Run => ({ combo: all[i]!, id, pass, costUsd, ms: 1000, missing: [], forbidden: [] })
    const rs = rows([run(0, true, 0.001), run(0, false, 0.001, 'E2'), run(1, true, 0.01), run(1, true, 0.01, 'E2')], all)
    expect(cheapest(rs, 2)?.combo.model).toBe('claude-sonnet-5-5')
    expect(table(rs, 2, null)).toMatch(/Cheapest that passed all 2: Sonnet 5\.5 high at \$0\.0200/)
  })
})
