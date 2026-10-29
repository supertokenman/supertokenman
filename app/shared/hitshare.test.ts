import { describe, expect, it } from 'vitest'
import { HIT_MIN_POSTS, HIT_WINDOW, hitShare } from './hitshare.js'
import type { OwnPost } from './besttime.js'

const DAY = 24 * 60 * 60 * 1000

function views(vs: number[]): OwnPost[] {
  return vs.map((v, i) => ({ at: 1_000_000_000_000 + i * DAY, views: v }))
}

describe('hitShare', () => {
  it('defaults to a 12-post window', () => {
    expect(HIT_WINDOW).toBe(12)
  })

  it('is not-enough below 6 posts with a metric', () => {
    expect(hitShare(views([100, 100, 100, 100, 100]))).toEqual({ kind: 'not-enough' })
    expect(HIT_MIN_POSTS).toBe(6)
    const ok = hitShare(views([100, 100, 100, 100, 100, 100]))
    expect(ok.kind).toBe('ok')
  })

  it('computes top and top-3 shares over the last n posts by time', () => {
    // newest 6 (by at) are 60, 10, 10, 10, 10, 10 -> total 110; older values are ignored with n=6
    const posts = views([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000])
    const recent = [60, 10, 10, 10, 10, 10].map((v, i) => ({ at: 2_000_000_000_000 + i * DAY, views: v }))
    const r = hitShare([...posts, ...recent], 6)
    expect(r).toEqual({ kind: 'ok', top: 60 / 110, top3: 80 / 110, posts: 6, metric: 'views' })
  })

  it('uses the default window of 12 when n is omitted', () => {
    const ps = views(Array.from({ length: 20 }, (_, i) => (i === 19 ? 500 : 10)))
    const r = hitShare(ps)
    // newest 12 by time: index 8..19 -> includes the 500 at index 19
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.posts).toBe(12)
  })

  it('zero views: total of zero gives zero shares, not NaN', () => {
    const r = hitShare(views([0, 0, 0, 0, 0, 0, 0]))
    expect(r).toEqual({ kind: 'ok', top: 0, top3: 0, posts: 7, metric: 'views' })
  })

  it('ties: equal top values give the same share, top-3 sums the three largest', () => {
    const r = hitShare(views([50, 50, 50, 50, 50, 50]))
    expect(r).toEqual({ kind: 'ok', top: 1 / 6, top3: 0.5, posts: 6, metric: 'views' })
  })

  it('fallback to engagement when no post has a view count', () => {
    const ps: OwnPost[] = [
      { at: 1 * DAY, likes: 10, comments: 5 },
      { at: 2 * DAY, likes: 1, shares: 1 },
      { at: 3 * DAY, likes: 2 },
      { at: 4 * DAY, likes: 2 },
      { at: 5 * DAY, likes: 2 },
      { at: 6 * DAY, comments: 2 },
      { at: 7 * DAY },
    ]
    const r = hitShare(ps)
    // engagement values: 15, 2, 2, 2, 2, 2 (the post with no counts is left out) -> total 25
    expect(r).toEqual({ kind: 'ok', top: 15 / 25, top3: 19 / 25, posts: 6, metric: 'engagement' })
  })

  it('uses views when the window has any view count, skipping posts without views', () => {
    const ps: OwnPost[] = [
      ...views([100, 100, 100, 100, 100, 100]),
      { at: 99 * DAY, likes: 999 },
    ]
    const r = hitShare(ps, 7)
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.metric).toBe('views')
  })

  it('drops posts with non-finite timestamps', () => {
    const ps = [...views([10, 10, 10, 10, 10, 10]), { at: Number.NaN, views: 1_000_000 }]
    const r = hitShare(ps)
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.posts).toBe(6)
  })
})
