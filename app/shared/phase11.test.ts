import { describe, expect, it } from 'vitest'
import { goalCommand, goalMet, withGoal } from './goal'
import { synopsis, synopsisText } from './synopsis'

describe('goal', () => {
  it('reads /goal commands', () => {
    expect(goalCommand('/goal all tests pass')).toEqual({ set: 'all tests pass' })
    expect(goalCommand('/goal clear')).toEqual({ clear: true })
    expect(goalCommand('/goal')).toEqual({ show: true })
    expect(goalCommand('set a goal')).toBeNull()
  })
  it('puts the goal in front of each message and sees when it is met', () => {
    expect(withGoal('go on', null)).toBe('go on')
    expect(withGoal('go on', { text: 'tests pass', at: 1 })).toMatch(/^\[Goal of this panel: tests pass\..*GOAL MET.*\]\n\ngo on$/s)
    expect(goalMet('All 12 pass.\n\nGOAL MET')).toBe(true)
    expect(goalMet('**GOAL MET**')).toBe(true)
    expect(goalMet('Not yet: the GOAL MET line comes later. 3 fail.')).toBe(false)
  })
})

describe('synopsis', () => {
  it('sums up a CSV with quotes', () => {
    const csv = 'id,name,city\n1,"Silva, Ana",SP\n2,Bia,RJ\n3,Zé,"Belo Horizonte"\n'
    expect(synopsis(csv, '.csv', 2)).toEqual({ kind: 'csv', rows: 3, columns: ['id', 'name', 'city'], sample: ['1,"Silva, Ana",SP', '2,Bia,RJ'] })
  })
  it('says unknown when the rows do not match the header', () => {
    expect(synopsis('a,b\n1,2,3\n4\n', '.csv')!.columns).toBe('unknown')
    expect(synopsis('a\tb\n1\t2\n', '.tsv')!.columns).toEqual(['a', 'b'])
  })
  it('reads JSON lines keys, and leaves other files alone', () => {
    expect(synopsis('{"a":1,"b":2}\n{"a":3}\n', '.jsonl')).toMatchObject({ rows: 2, columns: ['a', 'b'] })
    expect(synopsis('not json\n', '.jsonl')!.columns).toBe('unknown')
    expect(synopsis('x', '.ts')).toBeNull()
  })
  it('tells Claude how to get more', () => {
    const t = synopsisText('/p/d.csv', { kind: 'csv', rows: 12000, columns: ['id'], sample: ['1'] })
    expect(t).toContain('12,000 rows')
    expect(t).toMatch(/offset and limit/)
  })
})
