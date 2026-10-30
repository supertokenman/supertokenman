import { describe, expect, it } from 'vitest'
import { decide, planUpdate } from './packmerge'

describe('decide: spec section 7 table', () => {
  it('same | same: keep', () => {
    expect(decide('a', 'a', 'a')).toEqual({ action: 'keep', newBase: 'a' })
  })
  it('same | differs: update (user did not edit)', () => {
    expect(decide('a', 'a', 'b')).toEqual({ action: 'update', newBase: 'b' })
  })
  it('differs | same: keep the user file', () => {
    expect(decide('a', 'u', 'a')).toEqual({ action: 'keep', newBase: 'a' })
  })
  it('differs | differs, user == new: keep and record new base', () => {
    expect(decide('a', 'b', 'b')).toEqual({ action: 'keep', newBase: 'b' })
  })
  it('differs | differs: conflict, base kept', () => {
    expect(decide('a', 'u', 'b')).toEqual({ action: 'conflict', newBase: 'a' })
  })
  it('missing on disk: ask, whatever the new version holds', () => {
    expect(decide('a', null, 'a')).toEqual({ action: 'ask', newBase: 'a' })
    expect(decide('a', null, 'b')).toEqual({ action: 'ask', newBase: 'a' })
    expect(decide('a', null, null)).toEqual({ action: 'ask', newBase: 'a' })
  })
  it('absent in base, present in new: add when free', () => {
    expect(decide(null, null, 'b')).toEqual({ action: 'add', newBase: 'b' })
  })
  it('absent in base, present in new, non-pack file there: conflict', () => {
    expect(decide(null, 'u', 'b')).toEqual({ action: 'conflict', newBase: null })
  })
  it('absent in base, present in new, identical file there: keep and record', () => {
    expect(decide(null, 'b', 'b')).toEqual({ action: 'keep', newBase: 'b' })
  })
  it('present in base, absent in new: remove when user == base', () => {
    expect(decide('a', 'a', null)).toEqual({ action: 'remove', newBase: null })
  })
  it('present in base, absent in new, user edited: keep and report', () => {
    expect(decide('a', 'u', null)).toEqual({ action: 'keep', newBase: 'a' })
  })
  it('absent everywhere: keep', () => {
    expect(decide(null, null, null)).toEqual({ action: 'keep', newBase: null })
  })
})

describe('planUpdate', () => {
  it('lists conflicts and asks, keeps input order', () => {
    const plan = planUpdate([
      { path: 'a.md', base: 'x', user: 'x', next: 'y' },
      { path: 'b.md', base: 'x', user: 'u', next: 'y' },
      { path: 'c.md', base: 'x', user: null, next: 'x' },
      { path: 'd.md', base: null, user: null, next: 'z' },
    ])
    expect(plan.items.map((i) => [i.path, i.action])).toEqual([
      ['a.md', 'update'],
      ['b.md', 'conflict'],
      ['c.md', 'ask'],
      ['d.md', 'add'],
    ])
    expect(plan.conflicts).toEqual(['b.md'])
    expect(plan.asks).toEqual(['c.md'])
  })
  it('empty input gives an empty plan', () => {
    expect(planUpdate([])).toEqual({ items: [], conflicts: [], asks: [] })
  })
})
