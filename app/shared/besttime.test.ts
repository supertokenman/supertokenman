import { describe, expect, it } from 'vitest'
import { MIN_POSTS, bestTimes, type OwnPost } from './besttime'

// Local-time dates, so the weekday and hour checks hold in any time zone.
// 2026-10-26 is a Monday.
const mon = (h: number, dayOffset = 0) => new Date(2026, 9, 26 + dayOffset, h, 0).getTime()

describe('besttime', () => {
  it('under 12 posts says not enough data', () => {
    const posts: OwnPost[] = Array.from({ length: MIN_POSTS - 1 }, (_, i) => ({ at: mon(9 + (i % 4), i), likes: 5 }))
    expect(bestTimes(posts, 'engagement')).toEqual({ kind: 'not-enough', have: MIN_POSTS - 1, need: MIN_POSTS })
  })

  it('needs 3 distinct buckets too', () => {
    const posts: OwnPost[] = Array.from({ length: MIN_POSTS }, (_, i) => ({ at: mon(9, 7 * i), likes: i }))
    expect(bestTimes(posts, 'engagement')).toEqual({ kind: 'not-enough', have: MIN_POSTS, need: MIN_POSTS })
  })

  it('median per weekday hour', () => {
    const posts: OwnPost[] = [
      // Monday 09:00: 1, 3, 5, 100 -> median 4, 4 posts
      { at: mon(9, 0), likes: 1 }, { at: mon(9, 7), likes: 3 }, { at: mon(9, 14), likes: 5 }, { at: mon(9, 21), likes: 100 },
      // Tuesday 18:00: 2 posts, likes + comments + shares = 10 and 20 -> median 15
      { at: mon(18, 1), likes: 4, comments: 3, shares: 3 }, { at: mon(18, 8), likes: 20 },
      // Wednesday 07:00: 3 posts, median 2
      { at: mon(7, 2), likes: 2 }, { at: mon(7, 9), likes: 1 }, { at: mon(7, 16), likes: 3 },
      // Sunday 12:00: 3 posts, median 1 (no counts on one post, so it is left out)
      { at: mon(12, 6), likes: 1 }, { at: mon(12, 13), likes: 1 }, { at: mon(12, 20), likes: 1 },
      // Post with no counts at all: ignored
      { at: mon(9, 3) },
    ]
    const r = bestTimes(posts, 'engagement')
    expect(r).toEqual({
      kind: 'ok',
      slots: [
        { weekday: 1, hour: 18, median: 15, posts: 2 },
        { weekday: 0, hour: 9, median: 4, posts: 4 },
        { weekday: 2, hour: 7, median: 2, posts: 3 },
      ],
    })
  })

  it('uses views for the views metric', () => {
    const posts: OwnPost[] = Array.from({ length: MIN_POSTS }, (_, i) => ({ at: mon(10 + (i % 3), i), views: 100 * (i + 1), likes: 0 }))
    const r = bestTimes(posts, 'views')
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.slots.length).toBeLessThanOrEqual(3)
  })

  it('no metrics network', () => {
    const posts: OwnPost[] = Array.from({ length: 30 }, (_, i) => ({ at: mon(9 + (i % 5), i), likes: i }))
    expect(bestTimes(posts, null)).toEqual({ kind: 'no-metrics' })
  })
})
