// Phase 106: a turn that costs, reads or takes far more than this project usually does on this model.
// Robust and simple: the median and the median absolute deviation of the last turns, a turn counted
// as unusual only well above that band and well above the median, and only once there is history.

export type Metric = 'cost' | 'tokens' | 'seconds'
export type Sample = { at: number; cost: number; tokens: number; seconds: number }
export type Verdict = { metric: Metric; value: number; median: number; high: number; ratio: number; reason: string }

export const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
export const mad = (xs: number[]) => {
  const m = median(xs)
  return median(xs.map((x) => Math.abs(x - m)))
}

/** The normal band of a series: median ± k scaled MADs (1.4826 makes a MAD comparable to a std dev). */
export function band(xs: number[], k = 5): { median: number; low: number; high: number } {
  const m = median(xs)
  const spread = Math.max(1.4826 * mad(xs), m * 0.1)
  return { median: m, low: Math.max(0, m - k * spread), high: m + k * spread }
}

export const WORD: Record<Metric, (v: number) => string> = {
  cost: (v) => `US$ ${v.toFixed(v < 0.01 ? 4 : v < 0.1 ? 3 : 2)}`,
  tokens: (v) => (v < 1000 ? `${Math.round(v)} tokens` : `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k tokens`),
  seconds: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} s`,
}
const NOUN: Record<Metric, string> = { cost: 'cost', tokens: 'read', seconds: 'took' }

/** Unusual metrics of the newest sample against the ones before it; nothing until there are minN. */
export function check(history: Sample[], now: Sample, o: { k?: number; minN?: number; minRatio?: number; where?: string } = {}): Verdict[] {
  const minN = o.minN ?? 8
  if (history.length < minN) return []
  const out: Verdict[] = []
  for (const metric of ['cost', 'tokens', 'seconds'] as Metric[]) {
    const xs = history.map((h) => h[metric]).filter((x) => Number.isFinite(x) && x > 0)
    if (xs.length < minN) continue
    const b = band(xs, o.k ?? 5)
    const v = now[metric]
    const ratio = b.median > 0 ? v / b.median : 0
    if (v > b.high && ratio >= (o.minRatio ?? 3)) out.push({ metric, value: v, median: b.median, high: b.high, ratio, reason: `This turn ${NOUN[metric]} ${WORD[metric](v)}, ${ratio.toFixed(1)}x the usual ${WORD[metric](b.median)}${o.where ? ` for ${o.where}` : ''}.` })
  }
  return out
}
