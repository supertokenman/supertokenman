// Phase 94: a split-flap counter. Each changed character flips through the glyphs between the old and
// the new one, the columns starting one after another from the right, like a departures board.

const DIGITS = '0123456789'

export type Plan = { frames: string[]; stepMs: number; staggerMs: number; totalMs: number }

/** The glyphs a column shows on its way from a to b: digits roll forward, anything else swaps at once. */
export function path(a: string, b: string): string[] {
  if (a === b) return [b]
  const i = DIGITS.indexOf(a), j = DIGITS.indexOf(b)
  if (i < 0 || j < 0) return [b]
  const out: string[] = []
  for (let k = (i + 1) % 10; ; k = (k + 1) % 10) {
    out.push(DIGITS[k]!)
    if (k === j) break
  }
  return out
}

/**
 * The text at each tick, from `from` to `to`, right-aligned. Column c (from the right) starts after c
 * staggers; reduced motion gives the end at once.
 */
export function plan(from: string, to: string, opts: { stepMs?: number; staggerMs?: number; reduced?: boolean } = {}): Plan {
  const stepMs = opts.stepMs ?? 40
  const staggerMs = opts.staggerMs ?? 60
  if (opts.reduced || from === to) return { frames: [to], stepMs, staggerMs, totalMs: 0 }
  const w = Math.max(from.length, to.length)
  const a = from.padStart(w, ' '), b = to.padStart(w, ' ')
  const cols = [...b].map((ch, i) => path(a[i]!, ch))
  const startTick = (i: number) => Math.round(((w - 1 - i) * staggerMs) / stepMs)
  const ticks = Math.max(...cols.map((p, i) => startTick(i) + p.length))
  const frames: string[] = []
  for (let t = 1; t <= ticks; t++) frames.push(cols.map((p, i) => (t <= startTick(i) ? a[i]! : p[Math.min(p.length, t - startTick(i)) - 1]!)).join('').trimStart())
  return { frames, stepMs, staggerMs, totalMs: ticks * stepMs }
}
