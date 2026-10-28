import { describe, expect, it } from 'vitest'
import { CARD_H, CARD_W, bounds, clampZoom, defaultRect, fit, linkEnds, place, uniquePairs, zoomAt } from './canvas'

describe('canvas geometry', () => {
  it('clamps zoom', () => {
    expect(clampZoom(0.1)).toBe(0.3)
    expect(clampZoom(9)).toBe(1.5)
    expect(clampZoom(NaN)).toBe(1)
  })
  it('lays default cards in rows', () => {
    expect(defaultRect(0)).toEqual({ x: 40, y: 40, w: CARD_W, h: CARD_H })
    expect(defaultRect(3).y).toBeGreaterThan(defaultRect(0).y)
    expect(defaultRect(3).x).toBe(defaultRect(0).x)
  })
  it('keeps saved spots and fills free slots', () => {
    const r = place(['a', 'b'], { a: { x: 40, y: 40 } })
    expect(r.a!.x).toBe(40)
    expect(r.b).toEqual(defaultRect(1))
  })
  it('fits all cards in view', () => {
    const rects = [defaultRect(0), defaultRect(5)]
    const v = fit(rects, 1000, 800)
    const b = bounds(rects)!
    expect(b.x * v.zoom + v.x).toBeGreaterThanOrEqual(0)
    expect((b.x + b.w) * v.zoom + v.x).toBeLessThanOrEqual(1000.001)
    expect(fit([], 100, 100)).toEqual({ x: 0, y: 0, zoom: 1 })
  })
  it('zooms around the pointer', () => {
    const v = zoomAt({ x: 0, y: 0, zoom: 1 }, 1.2, 100, 100)
    expect((100 - v.x) / v.zoom).toBeCloseTo(100)
  })
  it('puts link ends on facing edges', () => {
    const [p, q] = linkEnds({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 })
    expect(p).toEqual({ x: 100, y: 50 })
    expect(q).toEqual({ x: 300, y: 50 })
  })
  it('lists each link once', () => {
    expect(uniquePairs({ a: [{ panel: 'b' }], b: [{ panel: 'a' }, { panel: 'c' }] })).toEqual([['a', 'b'], ['b', 'c']])
  })
})
