// Failover decision: for a classified failure, the panel's fallback prefs and the current model, show a card, switch, or do nothing.
// Pure: no I/O. Failure kinds come from failkind.ts.
import type { Failure } from './failkind.js'
export type Fallback = { model?: string; provider?: string }
export type FailoverPrefs = { fallback?: Fallback; always?: boolean; approved?: string[] }
export type Decision = { act: 'card' | 'switch' | 'none'; reason: string; waitUntil?: string }
export type Ctx = { hop?: number; attempt?: number; now?: number }

/** Retry delays for failures with no reset time: 1, 2, 5, 10 min (4 tries). */
export const BACKOFF_MS = [60_000, 120_000, 300_000, 600_000]
/** Added to a reset time before the resend. */
export const RESET_SLACK_MS = 30_000

/** Delay before retry `attempt` (0-based), or null once the tries are used up. */
export function backoff(attempt: number): number | null {
  return attempt >= 0 && attempt < BACKOFF_MS.length ? BACKOFF_MS[attempt]! : null
}

/**
 * `hop` counts switches already made for this prompt (one hop max), `attempt` the retries already made,
 * `now` the epoch ms used for backoff times. Without `now`, backoff gives no waitUntil.
 */
export function decide(f: Failure, prefs: FailoverPrefs, current: Fallback, ctx: Ctx = {}): Decision {
  if (f.kind === 'other') return { act: 'none', reason: 'Not a limit or outage; no fallback offered' }
  const reason = why(f)
  const waitUntil = waitFor(f, ctx)
  const fb = prefs.fallback
  if (!fb || (!fb.model && !fb.provider)) return { act: 'card', reason, waitUntil }
  if (sameTarget(fb, current)) return { act: 'none', reason: 'Fallback is the current model; showing the error' }
  if ((ctx.hop ?? 0) >= 1) return { act: 'card', reason: `Fallback also failed: ${reason}`, waitUntil }
  if (!prefs.always) return { act: 'card', reason, waitUntil }
  if (otherAccount(fb, current) && !(prefs.approved ?? []).includes(fb.provider!)) {
    return { act: 'card', reason: 'Fallback is on another account not yet approved for this panel', waitUntil }
  }
  return { act: 'switch', reason }
}

function why(f: Failure): string {
  const reset = f.resetsAt ? `, resets ${f.resetsAt}` : ''
  switch (f.kind) {
    case 'plan_window':
      return `${f.window === 'seven_day' ? '7-day' : f.window === 'five_hour' ? '5-hour' : 'Usage'} limit reached${reset}`
    case 'rate_limit':
      return `Rate limited (429)${reset}`
    case 'overloaded':
      return 'Model overloaded'
    case 'api_down':
      return 'API unreachable'
    default:
      return 'Error'
  }
}

function waitFor(f: Failure, ctx: Ctx): string | undefined {
  if (f.resetsAt) {
    const t = Date.parse(f.resetsAt)
    if (!Number.isNaN(t)) return new Date(t + RESET_SLACK_MS).toISOString()
  }
  if (f.kind === 'plan_window' || ctx.now === undefined) return undefined
  const d = backoff(ctx.attempt ?? 0)
  return d === null ? undefined : new Date(ctx.now + d).toISOString()
}

function sameTarget(fb: Fallback, cur: Fallback): boolean {
  return (fb.model ?? cur.model) === cur.model && (fb.provider ?? cur.provider) === cur.provider
}

function otherAccount(fb: Fallback, cur: Fallback): boolean {
  return fb.provider !== undefined && fb.provider !== cur.provider
}
