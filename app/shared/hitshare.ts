// Hit concentration from the person's own posts: how much of the total comes from the top post.
// Pure: no I/O, no network, no Claude call. A reference point, never a target.

import type { OwnPost } from './besttime.js'

export const HIT_WINDOW = 12
export const HIT_MIN_POSTS = 6

export type HitMetric = 'views' | 'engagement'

export type HitShare =
  | { kind: 'not-enough' }
  | { kind: 'ok'; top: number; top3: number; posts: number; metric: HitMetric }

function engagement(p: OwnPost): number | null {
  if (p.likes === undefined && p.comments === undefined && p.shares === undefined) return null
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0)
}

/**
 * Share of the top post (and of the top three) in the total over the last `n` posts by time.
 * Uses views when the window has any view count, otherwise engagement. Posts without the chosen
 * metric are left out. Fewer than HIT_MIN_POSTS such posts gives 'not-enough'.
 * A total of zero gives shares of 0 (no division by zero).
 */
export function hitShare(posts: OwnPost[], n: number = HIT_WINDOW): HitShare {
  const window = posts
    .filter((p) => Number.isFinite(p.at))
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, Math.floor(n)))

  const hasViews = window.some((p) => Number.isFinite(p.views))
  const metric: HitMetric = hasViews ? 'views' : 'engagement'
  const values: number[] = []
  for (const p of window) {
    const v = metric === 'views' ? (Number.isFinite(p.views) ? (p.views as number) : null) : engagement(p)
    if (v !== null) values.push(v)
  }

  if (values.length < HIT_MIN_POSTS) return { kind: 'not-enough' }

  const sorted = values.sort((a, b) => b - a)
  const total = sorted.reduce((s, x) => s + x, 0)
  if (total === 0) return { kind: 'ok', top: 0, top3: 0, posts: values.length, metric }

  const top3Sum = sorted.slice(0, 3).reduce((s, x) => s + x, 0)
  return {
    kind: 'ok',
    top: sorted[0]! / total,
    top3: top3Sum / total,
    posts: values.length,
    metric,
  }
}
