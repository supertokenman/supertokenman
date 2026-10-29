// Usage per panel, from what the panel's agent CLI reports locally: its turns' tokens and cost, and
// the rate-limit windows it streams. Nothing is fetched or estimated; what a CLI does not report
// reads "not reported". An optional cap per panel holds the next message once reached.

export type Window = { percentUsed: number; resetsAt?: string }
export type Usage = { cli: string; turns: number; usd?: number; tokens?: number; windows: Record<string, Window> }
export type Cap = { usd?: number; tokens?: number }
export type TurnReport = { costUsd?: number; inputTokens?: number; outputTokens?: number; cacheRead?: number; cacheWrite?: number }

export const empty = (cli: string): Usage => ({ cli, turns: 0, windows: {} })
const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** One finished turn. Cost is the session's running total (as Claude Code reports it); tokens are per turn. */
export function addTurn(u: Usage, t: TurnReport): Usage {
  const parts = [t.inputTokens, t.outputTokens, t.cacheRead, t.cacheWrite].filter(num)
  return {
    ...u,
    turns: u.turns + 1,
    usd: num(t.costUsd) ? Math.max(u.usd ?? 0, t.costUsd) : u.usd,
    tokens: parts.length ? (u.tokens ?? 0) + parts.reduce((a, b) => a + b, 0) : u.tokens,
  }
}

export function addWindows(u: Usage, ws: ({ kind: string } & Window)[]): Usage {
  const windows = { ...u.windows }
  for (const w of ws) if (w.kind && num(w.percentUsed)) windows[w.kind] = { percentUsed: w.percentUsed, resetsAt: w.resetsAt }
  return { ...u, windows }
}

export function cleanCap(c: Cap): Cap {
  const out: Cap = {}
  if (num(c.usd) && c.usd > 0) out.usd = c.usd
  if (num(c.tokens) && c.tokens > 0) out.tokens = Math.round(c.tokens)
  return out
}

export type Verdict = { ok: true } | { ok: false; reason: string }
/** Whether the next turn may go: only against what the CLI reported. Unreported usage never trips a cap. */
export function capVerdict(u: Usage, c: Cap): Verdict {
  if (c.usd && num(u.usd) && u.usd >= c.usd) return { ok: false, reason: `This panel reached its cap of US$ ${c.usd.toFixed(2)} (US$ ${u.usd.toFixed(2)} reported by ${u.cli}).` }
  if (c.tokens && num(u.tokens) && u.tokens >= c.tokens) return { ok: false, reason: `This panel reached its cap of ${k(c.tokens)} tokens (${k(u.tokens)} reported by ${u.cli}).` }
  return { ok: true }
}

const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n))
const WINDOW_NAMES: Record<string, string> = { five_hour: '5-hour window', seven_day: '7-day window', seven_day_opus: '7-day window (Opus)', seven_day_sonnet: '7-day window (Sonnet)' }
const NR = 'not reported'

/** Lines for the panel's usage card, each naming its source or saying it was not reported. */
export function rows(u: Usage, c: Cap = {}): { label: string; value: string }[] {
  const out = [
    { label: 'Cost this session', value: num(u.usd) ? `US$ ${u.usd.toFixed(2)}` : NR },
    { label: 'Tokens this session', value: num(u.tokens) ? k(u.tokens) : NR },
  ]
  const ws = Object.entries(u.windows)
  if (!ws.length) out.push({ label: 'Rate limits', value: NR })
  for (const [kind, w] of ws) out.push({ label: WINDOW_NAMES[kind] ?? kind.replace(/_/g, ' '), value: `${Math.round(w.percentUsed)}% used${w.resetsAt ? `, resets ${w.resetsAt.slice(0, 16).replace('T', ' ')} UTC` : ''}` })
  out.push({ label: 'Cap', value: c.usd || c.tokens ? [c.usd ? `US$ ${c.usd.toFixed(2)}` : '', c.tokens ? `${k(c.tokens)} tokens` : ''].filter(Boolean).join(' or ') : 'none' })
  return out
}

/** The chip's short text. */
export function chip(u: Usage, c: Cap = {}): string {
  const used = num(u.tokens) ? `${k(u.tokens)} tok` : 'usage'
  const share = c.usd && num(u.usd) ? u.usd / c.usd : c.tokens && num(u.tokens) ? u.tokens / c.tokens : null
  return share == null ? used : `${used} · ${Math.min(999, Math.round(share * 100))}% of cap`
}
