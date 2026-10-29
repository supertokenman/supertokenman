// Best time from the person's own past posts. Pure: no I/O, no network, no Claude call.

export const MIN_POSTS = 12
export const MIN_BUCKETS = 3
export const TOP = 3

/** What a network reports: engagement (likes + comments + shares) or views (YouTube). */
export type Metric = 'engagement' | 'views'

/** One own post as `posts(n)` returns it; counts are absent where the network does not give them. */
export type OwnPost = { at: number; likes?: number; comments?: number; shares?: number; views?: number }

/** A suggested weekday x hour bucket. weekday: 0 = Monday, 6 = Sunday; hour: 0-23, local time. */
export type Suggestion = { weekday: number; hour: number; median: number; posts: number }

export type BestTime =
  | { kind: 'no-metrics' }
  | { kind: 'not-enough'; have: number; need: number }
  | { kind: 'ok'; slots: Suggestion[] }

function valueOf(p: OwnPost, metric: Metric): number | null {
  if (metric === 'views') return Number.isFinite(p.views) ? (p.views as number) : null
  if (p.likes === undefined && p.comments === undefined && p.shares === undefined) return null
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0)
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * Buckets posts by local weekday (Monday-first) and hour, scores each bucket by median engagement
 * and returns the top suggestions. `metric` null means the network reports no engagement.
 * Posts without a count for the metric are left out of the count.
 */
export function bestTimes(posts: OwnPost[], metric: Metric | null): BestTime {
  if (metric === null) return { kind: 'no-metrics' }

  const buckets = new Map<number, { weekday: number; hour: number; values: number[] }>()
  let have = 0
  for (const p of posts) {
    const v = valueOf(p, metric)
    if (v === null || !Number.isFinite(p.at)) continue
    have++
    const d = new Date(p.at)
    const weekday = (d.getDay() + 6) % 7
    const hour = d.getHours()
    const key = weekday * 24 + hour
    const b = buckets.get(key) ?? { weekday, hour, values: [] }
    b.values.push(v)
    buckets.set(key, b)
  }

  if (have < MIN_POSTS || buckets.size < MIN_BUCKETS) return { kind: 'not-enough', have, need: MIN_POSTS }

  const scored: Suggestion[] = [...buckets.values()].map((b) => ({
    weekday: b.weekday, hour: b.hour, median: median(b.values), posts: b.values.length,
  }))
  scored.sort((a, b) => b.median - a.median || b.posts - a.posts || a.weekday - b.weekday || a.hour - b.hour)
  return { kind: 'ok', slots: scored.slice(0, TOP) }
}
