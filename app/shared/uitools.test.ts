import { describe, expect, it } from 'vitest'
import { CARD_GAP, CARD_H, CARD_W, checkArrange, checkLayout, checkLinks, checkOpen, MAX_OPEN, planArrange } from './uitools'

describe('checkLayout', () => {
  it('accepts the app layouts and row as columns', () => {
    expect(checkLayout('canvas')).toEqual({ ok: true, value: 'canvas' })
    expect(checkLayout(' Row ')).toEqual({ ok: true, value: 'columns' })
  })
  it('refuses others and says which exist', () => {
    const r = checkLayout('masonry')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('canvas')
    expect(checkLayout(3).ok).toBe(false)
  })
})

describe('checkArrange', () => {
  it('knows fit, row, column, grid', () => {
    for (const m of ['fit', 'row', 'column', 'grid']) expect(checkArrange(m)).toEqual({ ok: true, value: m })
    expect(checkArrange('spiral').ok).toBe(false)
  })
})

describe('checkOpen', () => {
  it('takes panels and an optional layout', () => {
    const r = checkOpen({ panels: [{ folder: '/a' }, { folder: 'b', title: 'B', persona: 'p', model: 'm' }], layout: 'canvas' })
    expect(r.ok && r.value.panels.length).toBe(2)
    expect(r.ok && r.value.layout).toBe('canvas')
  })
  it('refuses none, too many, no folder and a bad layout', () => {
    expect(checkOpen({ panels: [] }).ok).toBe(false)
    expect(checkOpen({ panels: Array.from({ length: MAX_OPEN + 1 }, () => ({ folder: '/a' })) }).ok).toBe(false)
    expect(checkOpen({ panels: [{ folder: '' }] }).ok).toBe(false)
    expect(checkOpen({ panels: [{ folder: '/a' }], layout: 'zig' }).ok).toBe(false)
    expect(checkOpen({}).ok).toBe(false)
  })
})

describe('checkLinks', () => {
  const known = new Set(['s1', 's2', 's3'])
  it('accepts links between open panels and drops repeats', () => {
    const r = checkLinks([{ from: 's1', to: 's2', mode: 'auto' }, { from: 's2', to: 's1', mode: 'waits' }, { from: 's2', to: 's3', mode: 'waits' }], known)
    expect(r.ok && r.value).toEqual([{ from: 's2', to: 's1', mode: 'waits' }, { from: 's2', to: 's3', mode: 'waits' }])
  })
  it('refuses self links, unknown panels, bad modes', () => {
    expect(checkLinks([{ from: 's1', to: 's1', mode: 'auto' }], known).ok).toBe(false)
    expect(checkLinks([{ from: 's1', to: 's9', mode: 'auto' }], known).ok).toBe(false)
    expect(checkLinks([{ from: 's1', to: 's2', mode: 'now' }], known).ok).toBe(false)
    expect(checkLinks([], known).ok).toBe(false)
  })
})

describe('planArrange', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  it('fit moves nothing', () => expect(planArrange('fit', ids)).toBeNull())
  it('row puts cards side by side on one line', () => {
    const p = planArrange('row', ids)!
    expect(p.a).toEqual({ x: CARD_GAP, y: CARD_GAP })
    expect(p.c).toEqual({ x: CARD_GAP + 2 * (CARD_W + CARD_GAP), y: CARD_GAP })
    expect(new Set(Object.values(p).map((q) => q.y)).size).toBe(1)
  })
  it('column stacks them', () => {
    const p = planArrange('column', ids)!
    expect(p.b).toEqual({ x: CARD_GAP, y: CARD_GAP + CARD_H + CARD_GAP })
    expect(new Set(Object.values(p).map((q) => q.x)).size).toBe(1)
  })
  it('grid is the squarest, wrapping rows', () => {
    const p = planArrange('grid', ids)! // 5 -> 3 across
    expect(p.c.y).toBe(CARD_GAP)
    expect(p.d).toEqual({ x: CARD_GAP, y: CARD_GAP + CARD_H + CARD_GAP })
    expect(planArrange('grid', ['a', 'b', 'c', 'd'])!.c).toEqual({ x: CARD_GAP, y: CARD_GAP + CARD_H + CARD_GAP })
  })
  it('never overlaps', () => {
    for (const m of ['row', 'column', 'grid'] as const) {
      const p = Object.values(planArrange(m, ids)!)
      for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) expect(Math.abs(p[i]!.x - p[j]!.x) >= CARD_W || Math.abs(p[i]!.y - p[j]!.y) >= CARD_H).toBe(true)
    }
  })
  it('handles no panels', () => expect(planArrange('grid', [])).toEqual({}))
})

import { listPanels } from './uitools.js'
describe('listPanels', () => {
  it('lists a panel with no session yet as not started', () => {
    const r = listPanels([{ id: 's1', folder: '/a', name: 'a', persona: null }], [
      { id: 's1', folder: '/a', title: 'a', state: 'ready' },
      { id: 's2', folder: '/b', title: 'b', state: 'not started' },
    ])
    expect(r.map((x) => [x.id, x.state, x.folder])).toEqual([['s1', 'ready', '/a'], ['s2', 'not started', '/b']])
  })
  it('falls back to the sessions when the window does not answer', () => {
    expect(listPanels([{ id: 's1', folder: '/a', name: 'a', persona: 'x' }], undefined).map((x) => x.id)).toEqual(['s1'])
  })
})
