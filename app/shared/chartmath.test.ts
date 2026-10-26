import { describe, expect, it } from 'vitest'
import { compact, nearest, niceTicks, scale, timeTicks } from './chartmath'

describe('chart math', () => {
  it('makes round ticks', () => {
    expect(niceTicks(0, 120, 5, true)).toEqual([0, 25, 50, 75, 100, 125])
    expect(niceTicks(3, 7, 4)).toEqual([3, 4, 5, 6, 7])
    expect(niceTicks(-5, 5, 4, true)).toEqual([-5, -2.5, 0, 2.5, 5])
    expect(niceTicks(0.1, 0.35, 5)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35])
    expect(niceTicks(4, 4, 5, true)).toEqual([0, 1, 2, 3, 4])
    expect(niceTicks(0, 0, 5, true)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })
  it('writes compact numbers', () => {
    expect(compact(1234)).toBe('1234')
    expect(compact(12345)).toBe('12k')
    expect(compact(2_500_000)).toBe('2.5M')
    expect(compact(-3_200_000_000)).toBe('-3.2B')
    expect(compact(0.12345)).toBe('0.12')
  })
  it('picks time steps', () => {
    const t0 = Date.UTC(2026, 9, 1)
    expect(timeTicks(t0, t0 + 7 * 86_400_000, 8).ticks.length).toBeGreaterThanOrEqual(7)
    expect(timeTicks(t0, t0 + 3 * 3_600_000, 6).label(t0 + 3_600_000)).toMatch(/^\d\d:\d\d$/)
  })
  it('scales and finds the nearest', () => {
    expect(scale(0, 10, 0, 100)(5)).toBe(50)
    expect(scale(0, 10, 100, 0)(10)).toBe(0)
    expect(nearest([0, 10, 20, 30], 14)).toBe(1)
  })
})
