import { describe, expect, it } from 'vitest'
import { clock, day, hm, roundState, stretch, summary, tick, type TimeLog } from './focusRound'

const T = Date.parse('2026-10-22T15:00:00')

describe('time and focus', () => {
  it('ticks your minute once and Claude per busy project', () => {
    let log: TimeLog = {}
    log = tick(log, T, [
      { project: 'engine', youActive: true, claudeBusy: true },
      { project: 'studio', youActive: false, claudeBusy: true },
      { project: 'studio', youActive: false, claudeBusy: true },
    ])
    log = tick(log, T + 60000, [{ project: 'engine', youActive: true, claudeBusy: false }])
    expect(log[day(T)]).toEqual({ engine: { you: 2, claude: 1 }, studio: { you: 0, claude: 1 } })
  })

  it('sums days by project, largest first', () => {
    const log: TimeLog = { [day(T)]: { engine: { you: 30, claude: 10 } }, [day(T - 86400000)]: { studio: { you: 50, claude: 20 }, engine: { you: 5, claude: 0 } } }
    expect(summary(log, T)).toMatchObject({ you: 30, claude: 10 })
    const week = summary(log, T, 7)
    expect(week.rows.map((r) => r.project)).toEqual(['studio', 'engine'])
    expect(week.you).toBe(85)
  })

  it('measures the current stretch of work, broken by a 5-minute pause', () => {
    const m = 60000
    const acts = [0, 2 * m, 4 * m, 20 * m, 23 * m, 26 * m, 29 * m]
    expect(stretch(acts, 30 * m)).toBe(10 * m)
    expect(stretch(acts, 40 * m)).toBe(0)
    expect(stretch([], 1)).toBe(0)
  })

  it('counts a round down', () => {
    const f = { goal: 'caption field', sid: 's1', startedAt: 0, minutes: 25, kind: 'focus' as const }
    expect(roundState(f, 5 * 60000)).toMatchObject({ left: 20 * 60000, done: false })
    expect(roundState(f, 26 * 60000)).toMatchObject({ left: 0, done: true, progress: 1 })
    expect(clock(20 * 60000 - 500)).toBe('20:00')
    expect(clock(61000)).toBe('1:01')
    expect(hm(130)).toBe('2h10')
    expect(hm(45)).toBe('45 min')
  })
})
