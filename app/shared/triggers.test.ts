import { describe as group, expect, it } from 'vitest'
import { cleanTrigger, describe, isDue, newReviews, nextRun } from './triggers'

const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

group('triggers', () => {
  it('finds the next weekday slot', () => {
    // Friday 2026-10-23 10:00 -> Monday 09:00
    expect(nextRun({ kind: 'schedule', days: [1, 2, 3, 4, 5], time: '09:00' }, local(2026, 10, 23, 10))).toBe(local(2026, 10, 26, 9))
    expect(nextRun({ kind: 'schedule', days: [5], time: '11:30' }, local(2026, 10, 23, 10))).toBe(local(2026, 10, 23, 11, 30))
    expect(nextRun({ kind: 'schedule', days: [], time: '09:00' }, 0)).toBeNull()
  })
  it('is due once its slot comes, and not again until the next', () => {
    const t = cleanTrigger({ when: { kind: 'schedule', days: [5], time: '09:00' }, lastRun: local(2026, 10, 16, 9) })
    expect(isDue(t, local(2026, 10, 23, 8, 59))).toBe(false)
    expect(isDue(t, local(2026, 10, 23, 9, 0))).toBe(true)
    expect(isDue({ ...t, lastRun: local(2026, 10, 23, 9) }, local(2026, 10, 23, 15))).toBe(false)
    expect(isDue({ ...t, enabled: false }, local(2026, 10, 23, 9))).toBe(false)
  })
  it('a slot missed while the Mac slept runs once on wake', () => {
    const t = cleanTrigger({ when: { kind: 'schedule', days: [5], time: '09:00' }, lastRun: local(2026, 10, 16, 9) })
    expect(isDue(t, local(2026, 10, 23, 13))).toBe(true)
  })
  it('a schedule saved after its slot waits for the next one', () => {
    const t = cleanTrigger({ when: { kind: 'schedule', days: [5], time: '09:00' }, armedAt: local(2026, 10, 23, 10) })
    expect(isDue(t, local(2026, 10, 23, 11))).toBe(false)
    expect(isDue(t, local(2026, 10, 30, 9))).toBe(true)
  })
  it('every N minutes counts from the last run', () => {
    const t = cleanTrigger({ when: { kind: 'every', minutes: 30 }, lastRun: 0 })
    expect(isDue(t, 29 * 60_000)).toBe(false)
    expect(isDue(t, 30 * 60_000)).toBe(true)
  })
  it('only new review requests fire, and not on the first look', () => {
    const a = newReviews(null, ['r#1'])
    expect(a.fresh).toEqual([])
    expect(newReviews(a.seen, ['r#1', 'r#2']).fresh).toEqual(['r#2'])
  })
  it('reads well', () => {
    expect(describe({ kind: 'schedule', days: [5, 1, 2, 3, 4], time: '09:00' })).toBe('Mon to Fri at 09:00')
    expect(describe({ kind: 'every', minutes: 120 })).toBe('Every 2 h')
    expect(cleanTrigger({ when: { kind: 'every', minutes: 7 } }).when).toEqual({ kind: 'every', minutes: 60 })
  })
})

group('trigger caps fields', () => {
  it('raises an every interval to the minimum and keeps the failure state', () => {
    expect(cleanTrigger({ when: { kind: 'every', minutes: 15 } }, 30).when).toEqual({ kind: 'every', minutes: 30 })
    expect(cleanTrigger({ when: { kind: 'every', minutes: 15 } }).when).toEqual({ kind: 'every', minutes: 15 })
    const t = cleanTrigger({ failures: 10, disabledReason: 'failures', note: 'off', enabled: false })
    expect(t).toMatchObject({ failures: 10, disabledReason: 'failures', note: 'off', enabled: false })
    expect(cleanTrigger({}).disabledReason).toBeUndefined()
  })
})
