// Glue for the queue, failover and channel wiring in the main process: texts, labels and the card the window shows.
// Pure, so the wording and the choices are tested without Electron.
import type { Failure } from './failkind.js'
import type { Decision, Fallback, FailoverPrefs } from './failover.js'
import { BACKOFF_MS } from './failover.js'

/** "claude-opus-4-8" -> "opus 4.8"; anything else as it is. */
export function modelLabel(id?: string): string {
  if (!id) return 'the current model'
  const m = /^claude-(haiku|sonnet|opus)-(\d+)-(\d+)(?:-\d+)?$/.exec(id)
  if (m) return `${m[1]} ${m[2]}.${m[3]}`
  const f = /^claude-(haiku|sonnet|opus)-(\d+)(?:-\d+)?$/.exec(id)
  return f ? `${f[1]} ${f[2]}` : id
}

/** The clock time of an ISO instant, "14:30", in the given zone (the person's by default). */
export function clock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, ...(timeZone ? { timeZone } : {}) })
}

export function reasonText(f: Failure, timeZone?: string): string {
  const reset = f.resetsAt ? `, resets ${clock(f.resetsAt, timeZone)}` : ''
  switch (f.kind) {
    case 'plan_window':
      return `${f.window === 'seven_day' ? '7-day' : f.window === 'five_hour' ? '5-hour' : 'Usage'} limit reached${reset}`
    case 'rate_limit':
      return `Rate limited (429)${reset}`
    case 'overloaded':
      return 'The model is overloaded'
    case 'api_down':
      return 'The API is unreachable'
    default:
      return 'Error'
  }
}

/** The line kept in the transcript for a switch. */
export function switchNote(from: Fallback, to: Fallback, f: Failure, auto: boolean, timeZone?: string): string {
  const name = (x: Fallback) => (x.provider === 'custom' ? 'the custom endpoint' : modelLabel(x.model))
  const one = to.model && to.provider === 'custom' ? `${modelLabel(to.model)} on the custom endpoint` : name(to)
  return `${auto ? 'Switched automatically' : 'Switched'} from ${name(from)} to ${one}: ${reasonText(f, timeZone)}.`
}

export type CardView = {
  id: string
  kind: Failure['kind']
  reason: string
  resetsAt?: string
  /** when "Wait" resends, as an ISO instant; absent when the tries are used up */
  waitUntil?: string
  attempt: number
  maxAttempts: number
  fallback?: { label: string; model?: string; provider?: string; url?: string }
  /** why Switch is not offered; the card then offers Cancel and Wait only */
  noSwitch?: string
  /** a switch to the custom endpoint sends the conversation there: the card asks once more */
  confirm?: string
  always: boolean
  prompt: string
  /** set while a resend is scheduled */
  waiting?: { until: string }
  closed?: 'switched' | 'waited' | 'cancelled'
}

export type CardInput = {
  id: string
  failure: Failure
  decision: Decision
  prefs: FailoverPrefs
  attempt: number
  prompt: string
  custom?: { on: boolean; url: string }
  canResume: boolean
  timeZone?: string
}

export function cardOf(i: CardInput): CardView {
  const fb = i.prefs.fallback
  const view: CardView = {
    id: i.id,
    kind: i.failure.kind,
    reason: reasonText(i.failure, i.timeZone),
    ...(i.failure.resetsAt ? { resetsAt: i.failure.resetsAt } : {}),
    ...(i.decision.waitUntil ? { waitUntil: i.decision.waitUntil } : {}),
    attempt: i.attempt,
    maxAttempts: BACKOFF_MS.length,
    always: Boolean(i.prefs.always),
    prompt: i.prompt.replace(/\s+/g, ' ').trim().slice(0, 140),
  }
  if (!fb || (!fb.model && !fb.provider)) return { ...view, noSwitch: 'No fallback is set. Pick one in the model menu.' }
  const custom = fb.provider === 'custom'
  const label = custom ? (fb.model ? `${modelLabel(fb.model)} on the custom endpoint` : 'the custom endpoint') : modelLabel(fb.model)
  view.fallback = { label, ...(fb.model ? { model: fb.model } : {}), ...(fb.provider ? { provider: fb.provider } : {}), ...(custom && i.custom?.url ? { url: i.custom.url } : {}) }
  if (custom && !i.custom?.on) view.noSwitch = 'The custom endpoint is off. Turn it on in the model menu settings.'
  else if (custom && !i.canResume) view.noSwitch = 'This panel has no session to resume on another endpoint yet.'
  else if (custom) view.confirm = `This sends the conversation to ${i.custom?.url ?? 'the custom endpoint'}, which may bill another account.`
  return view
}

/** The queue paused for a limit: the reason the person reads under the composer. */
export const queueHeldFor = (reason: string) => `Paused: ${reason}`
