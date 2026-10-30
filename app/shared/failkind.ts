// Phase: failover. Classifies a failed prompt into a kind. Pure; no I/O.
// Matches are anchored to the start of the text, so a 429 inside a tool output or prose is `other`.

export type FailKind = 'plan_window' | 'rate_limit' | 'overloaded' | 'api_down' | 'other'
export type FailWindow = 'five_hour' | 'seven_day'
export type Failure = { kind: FailKind; window?: FailWindow; resetsAt?: string; status?: number; raw: string }
export type LimitWindow = { kind: string; percentUsed: number; resetsAt?: string }
/** text: the result text; subtype: used when the text is empty (the app stores the subtype for non-success results). */
export type FailInput = { text?: string; subtype?: string; status?: number }

// the CLI's plan line: "Claude AI usage limit reached|<epoch seconds>"
const PLAN = /^Claude AI usage limit reached(?:\|(\d{9,11}))?$/
const API = /^API Error: (\d{3})\b/
const RATE_BODY = /^API Error: \d{3} .*"rate_limit_error"/
const OVERLOAD = /^(?:API Error: )?529\b|^API Error: \d{3} .*"overloaded_error"/
const NET = /^(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)\b|^fetch failed\b/

const epochIso = (s?: string): string | undefined => (s ? new Date(Number(s) * 1000).toISOString() : undefined)

/** The plan window still in force: at or over 100%, reset in the future. The one that resets last is the one to wait for. */
function reached(windows: LimitWindow[], now: number): { window: FailWindow; resetsAt: string } | undefined {
  const hits: { window: FailWindow; resetsAt: string }[] = []
  for (const w of windows) {
    if ((w.kind !== 'five_hour' && w.kind !== 'seven_day') || w.percentUsed < 100 || !w.resetsAt) continue
    if (!(Date.parse(w.resetsAt) > now)) continue
    hits.push({ window: w.kind, resetsAt: w.resetsAt })
  }
  return hits.sort((a, b) => Date.parse(b.resetsAt) - Date.parse(a.resetsAt))[0]
}

export function classify(input: FailInput, windows: LimitWindow[], now: number): Failure {
  const raw = String(input.text ?? '')
  const text = (raw || input.subtype || '').trim()
  const m = API.exec(text)
  const status = input.status ?? (m ? Number(m[1]) : undefined)
  const fail = (kind: FailKind, extra: Partial<Failure> = {}): Failure => ({ kind, status, raw, ...extra })
  const full = reached(windows, now)

  const plan = PLAN.exec(text)
  if (plan) return fail('plan_window', { window: full?.window, resetsAt: epochIso(plan[1]) ?? full?.resetsAt })
  if (status === 429 || RATE_BODY.test(text)) {
    return full ? fail('plan_window', { window: full.window, resetsAt: full.resetsAt }) : fail('rate_limit')
  }
  if (status === 529 || OVERLOAD.test(text)) return fail('overloaded')
  if ((status !== undefined && status >= 500 && status <= 599) || NET.test(text)) return fail('api_down')
  return fail('other')
}
