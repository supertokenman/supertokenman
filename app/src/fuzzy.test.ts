import { describe, expect, it } from 'vitest'
import { grouped, score, search, type Entry } from './fuzzy'

const e = (label: string, keywords = ''): Entry => ({ id: label, group: 'x', label, keywords, run: () => {} })

describe('palette', () => {
  it('scores prefixes over substrings over scattered letters', () => {
    expect(score('doc', 'Docker')).toBeGreaterThan(score('doc', 'Open docs'))
    expect(score('prq', 'Pull requests')).toBeGreaterThan(0)
    expect(score('prs', 'Pull requests')).toBeGreaterThan(0)
    expect(score('zz', 'Docker')).toBe(0)
  })
  it('groups results without repeating a group', () => {
    const r = grouped([{ ...e('a'), group: 'S' }, { ...e('b'), group: 'R' }, { ...e('c'), group: 'S' }])
    expect(r.map((x) => x.label)).toEqual(['a', 'c', 'b'])
  })
  it('finds by keywords and keeps the best first', () => {
    const r = search([e('Ports'), e('Pull requests', 'prs github review'), e('Publish')], 'review')
    expect(r.map((x) => x.label)).toEqual(['Pull requests'])
    expect(search([e('Spend'), e('Docker')], '').length).toBe(2)
  })
})
