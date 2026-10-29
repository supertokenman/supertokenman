import { describe, expect, it } from 'vitest'
import { checkLimits, staggerPlan, DEFAULT_GAP_MIN, DEFAULT_DAILY_CAP, DEFAULT_MIN_GAP_MIN, type StaggerItem, type StaggerPlan } from './stagger.js'

// 2026-10-25 is a Sunday; Oct 26 is Monday (day 1)
const now = new Date(2026, 9, 25, 15, 0)
const t = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime()
const monday = (time: string) => ({ day: 1, time })
// the plan covers four weeks; these tests look at the first Monday only
const firstWeek = (plan: StaggerPlan): StaggerPlan => ({
  placed: plan.placed.filter((p) => p.when < t(27, 0)),
  refused: plan.refused.filter((r) => r.when < t(27, 0)),
})

describe('stagger', () => {
  it('defaults are 20 min gap, 3 posts a day, 120 min minimum gap', () => {
    expect(DEFAULT_GAP_MIN).toBe(20)
    expect(DEFAULT_DAILY_CAP).toBe(3)
    expect(DEFAULT_MIN_GAP_MIN).toBe(120)
  })

  it('20 min offsets', () => {
    const plan = firstWeek(staggerPlan([monday('09:00')], ['a', 'b', 'c'], DEFAULT_GAP_MIN, {}, [], now))
    expect(plan.refused).toEqual([])
    expect(plan.placed).toEqual([
      { accountId: 'a', when: t(26, 9, 0) },
      { accountId: 'b', when: t(26, 9, 20) },
      { accountId: 'c', when: t(26, 9, 40) },
    ])
  })

  it('daily cap refuses', () => {
    const slots = ['09:00', '11:00', '13:00', '15:00'].map(monday)
    const plan = firstWeek(staggerPlan(slots, ['a'], DEFAULT_GAP_MIN, {}, [], now))
    expect(plan.placed.map((p) => p.when)).toEqual([t(26, 9), t(26, 11), t(26, 13)])
    expect(plan.refused).toHaveLength(1)
    expect(plan.refused[0].when).toBe(t(26, 15))
    expect(plan.refused[0].reason).toMatch(/Daily cap of 3/)
  })

  it('daily cap can be overridden per account', () => {
    const slots = ['09:00', '11:00', '13:00', '15:00'].map(monday)
    const plan = firstWeek(staggerPlan(slots, ['a'], DEFAULT_GAP_MIN, { a: { dailyCap: 4 } }, [], now))
    expect(plan.refused).toEqual([])
    expect(plan.placed).toHaveLength(4)
  })

  it('min gap refuses', () => {
    const plan = firstWeek(staggerPlan([monday('09:00'), monday('10:00')], ['a'], DEFAULT_GAP_MIN, {}, [], now))
    expect(plan.placed).toEqual([{ accountId: 'a', when: t(26, 9) }])
    expect(plan.refused).toHaveLength(1)
    expect(plan.refused[0].reason).toMatch(/minimum gap is 120 min/)
  })

  it('min gap can be overridden per account', () => {
    const plan = firstWeek(staggerPlan([monday('09:00'), monday('10:00')], ['a'], DEFAULT_GAP_MIN, { a: { minGapMin: 30 } }, [], now))
    expect(plan.refused).toEqual([])
    expect(plan.placed).toHaveLength(2)
  })

  it('checkLimits counts the queue of the same account only', () => {
    const queue: StaggerItem[] = [{ id: 'q1', network: 'x', when: t(26, 9), accountId: 'a' }]
    expect(checkLimits('b', t(26, 9, 30), queue, {})).toBeNull()
    expect(checkLimits('a', t(26, 9, 30), queue, {})).toMatch(/minimum gap/)
  })
})
