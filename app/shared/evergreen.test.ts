import { describe, expect, it } from 'vitest'
import { evergreenCandidates, isTimeBound, MIN_AGE_DAYS } from './evergreen'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 29)
const old = (days: number) => NOW - (days + 1) * DAY
const p = (id: string, engagement: number, text = 'A tip on keeping notes tidy', days = 60) => ({ id, text, at: old(days), engagement })

describe('evergreen', () => {
  it('flags time-bound words, dates and version numbers', () => {
    expect(isTimeBound('Going live today')).toBe(true)
    expect(isTimeBound('See you this week')).toBe(true)
    expect(isTimeBound('Released on 12/03/2025')).toBe(true)
    expect(isTimeBound('Shipped 29 Oct')).toBe(true)
    expect(isTimeBound('October 2026 roundup')).toBe(true)
    expect(isTimeBound('Version 2 is out')).toBe(true)
    expect(isTimeBound('Update to v1.4.2 now')).toBe(true)
    expect(isTimeBound('Launch day!')).toBe(true)
    expect(isTimeBound('Keep notes in plain text, forever useful')).toBe(false)
    expect(isTimeBound('Ratio 3.5x faster')).toBe(false)
  })

  it('takes only the top quartile, older than the minimum age, ranked', () => {
    const posts = [p('a', 100), p('b', 90), p('c', 5), p('d', 4), p('e', 3), p('f', 2), p('g', 1), p('h', 1)]
    expect(evergreenCandidates(posts, NOW).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('drops posts younger than the minimum age', () => {
    const young = { id: 'y', text: 'tip', at: NOW - 5 * DAY, engagement: 999 }
    const got = evergreenCandidates([young, p('a', 1), p('b', 1), p('c', 1), p('d', 1)], NOW)
    expect(got.map((x) => x.id)).not.toContain('y')
    expect(MIN_AGE_DAYS).toBe(30)
  })

  it('drops time-bound posts and posts without engagement', () => {
    const posts = [p('a', 100, 'Launching today!'), p('b', 90), p('c', 80), p('d', 1), { id: 'e', text: 'x', at: old(60) }, p('f', 1), p('g', 1), p('h', 1)]
    expect(evergreenCandidates(posts, NOW).map((x) => x.id)).toEqual(['b'])
  })

  it('returns nothing without measured posts', () => {
    expect(evergreenCandidates([], NOW)).toEqual([])
    expect(evergreenCandidates([{ id: 'a', text: 't', at: old(60) }], NOW)).toEqual([])
  })
})
