// The cost band of a task: what one request cost from the message to the end of its turn, kept in a
// ledger so styles and personas can be compared on real use, not on someone's benchmark.

export type Band = { at: number; project: string; persona?: string; styles: string[]; prompt: string; costUsd: number; tokens: number; ms: number; tools: number; edits: number; isError: boolean }

export type BandSummary = { key: string; n: number; costUsd: number; tokens: number; ms: number; edits: number; errors: number }

/** Averages per style set ("none" when no style was on), most used first. */
export function byStyles(bands: Band[]): BandSummary[] {
  const groups = new Map<string, Band[]>()
  for (const b of bands) {
    const k = b.styles.length ? [...b.styles].sort().join('+') : 'none'
    groups.set(k, [...(groups.get(k) ?? []), b])
  }
  const avg = (xs: Band[], f: (b: Band) => number) => xs.reduce((s, b) => s + f(b), 0) / xs.length
  return [...groups.entries()]
    .map(([key, xs]) => ({ key, n: xs.length, costUsd: avg(xs, (b) => b.costUsd), tokens: Math.round(avg(xs, (b) => b.tokens)), ms: Math.round(avg(xs, (b) => b.ms)), edits: avg(xs, (b) => b.edits), errors: xs.filter((b) => b.isError).length }))
    .sort((a, b) => b.n - a.n)
}

/** How a style set compares with none: the change in average cost and tokens, when both have enough tasks. */
export function versusNone(s: BandSummary[], key: string, min = 5): { cost: number; tokens: number } | null {
  const a = s.find((x) => x.key === key)
  const b = s.find((x) => x.key === 'none')
  if (!a || !b || a.n < min || b.n < min || !b.costUsd || !b.tokens) return null
  return { cost: Math.round(((a.costUsd - b.costUsd) / b.costUsd) * 100), tokens: Math.round(((a.tokens - b.tokens) / b.tokens) * 100) }
}
