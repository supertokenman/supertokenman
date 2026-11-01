// Phase 106: a turn that costs, reads or takes far more than this project usually does on this model.
// Robust and simple: the median and the median absolute deviation of the last turns, a turn counted
// as unusual only well above that band and well above the median, and only once there is history.

export type Metric = 'cost' | 'tokens' | 'seconds'
/** seconds is wall time (kept for the chart); active is wall time minus waiting for the person or other panels; tools is the tool-call count. */
export type Sample = { at: number; cost: number; tokens: number; seconds: number; active?: number; tools?: number }
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

/** Turns are only compared with turns of the same shape: no tool calls, a few, or many. */
export const shapeOf = (tools = 0): 'chat' | 'few' | 'many' => (tools <= 0 ? 'chat' : tools <= 5 ? 'few' : 'many')
export const NOTE_GAP_MS = 30 * 60_000
/** At most one anomaly note per panel per 30 minutes. */
export const noteDue = (last: number | undefined, now: number, gap = NOTE_GAP_MS) => last === undefined || now - last >= gap
/** Informational by default; only a cost far out (10x the usual) is a warning. */
export const toneOf = (v: Verdict): 'error' | undefined => (v.metric === 'cost' && v.ratio >= 10 ? 'error' : undefined)

/** Tools that park the turn on someone else (another panel, a subagent, the person). */
export const BLOCKING_TOOL = /(^|__)(message_panel|delegate|collect|panel_wait|Task|Agent|AskUserQuestion)$/
/** Counts tool calls and the time the turn spent waiting, to give the active time of a turn. */
export function turnClock() {
  let tools = 0
  let since: number | null = null
  let blocked = 0
  const resume = (now: number) => { if (since !== null) blocked += Math.max(0, now - since); since = null }
  return {
    /** An assistant message with these tool names, or a permission/ask card (names empty, wait true). */
    event(now: number, names: string[], wait = false) {
      resume(now)
      tools += names.length
      if (wait || names.some((n) => BLOCKING_TOOL.test(n))) since = now
    },
    /** Anything else that shows the turn moving again (a tool result, the person answering). */
    moved(now: number) { resume(now) },
    finish(now: number, wallMs: number) {
      resume(now)
      return { tools, active: Math.max(0, wallMs - blocked) / 1000 }
    },
  }
}

export type CheckOpts = { k?: number; minN?: number; minRatio?: number; minRatioDuration?: number; duration?: boolean; where?: string }
/** Unusual metrics of the newest sample against the ones before it; nothing until there are minN comparable turns.
 *  Duration is active time, against turns of the same shape, and is off unless asked for. */
export function check(history: Sample[], now: Sample, o: CheckOpts = {}): Verdict[] {
  const minN = o.minN ?? 10
  if (history.length < minN) return []
  const out: Verdict[] = []
  for (const metric of ['cost', 'tokens', 'seconds'] as Metric[]) {
    let pool = history
    let v = now[metric]
    if (metric === 'seconds') {
      if (!o.duration || now.active === undefined) continue
      pool = history.filter((h) => h.active !== undefined && shapeOf(h.tools) === shapeOf(now.tools))
      v = now.active
    }
    const xs = pool.map((h) => (metric === 'seconds' ? h.active! : h[metric])).filter((x) => Number.isFinite(x) && x > 0)
    if (xs.length < minN) continue
    const b = band(xs, o.k ?? 5)
    const ratio = b.median > 0 ? v / b.median : 0
    if (v > b.high && ratio >= (metric === 'seconds' ? o.minRatioDuration ?? 5 : o.minRatio ?? 3)) out.push({ metric, value: v, median: b.median, high: b.high, ratio, reason: `This turn ${NOUN[metric]} ${WORD[metric](v)}, ${ratio.toFixed(1)}x the usual ${WORD[metric](b.median)}${o.where ? ` for ${o.where}` : ''}.` })
  }
  return out
}
