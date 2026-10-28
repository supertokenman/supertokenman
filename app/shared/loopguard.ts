// Loop detection (2026-10-28): a panel's agent going in circles, the same tool call again and again, two
// calls taking turns (A, B, A, B...), or the same error coming back. When it trips, the panel is paused
// the way Stop pauses it and the notice says what the repeats cost. Pure: no clock, no I/O, no network.
import { priceFor } from './prices.js'

export type LoopConfig = {
  /** pause at all; on by default, since it only stops a turn and never sends anything */
  on: boolean
  /** this many identical calls... */
  repeats: number
  /** ...within the last this many tool calls */
  window: number
  /** the same error this many times in a row */
  errors: number
}
export const LOOP_DEFAULTS: LoopConfig = { on: true, repeats: 4, window: 6, errors: 3 }
export const LOOP_LIMITS = { repeats: [2, 20], window: [2, 40], errors: [2, 20] } as const

/** Settings as saved (any shape) to a config inside the limits. */
export function loopConfig(saved: unknown): LoopConfig {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof LoopConfig, unknown>>
  const n = (k: 'repeats' | 'window' | 'errors') => {
    const v = Math.round(Number(s[k]))
    const [lo, hi] = LOOP_LIMITS[k]
    return Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, v)) : LOOP_DEFAULTS[k]
  }
  const repeats = n('repeats')
  return { on: s.on !== false, repeats, window: Math.max(repeats, n('window')), errors: n('errors') }
}

export type LoopStep = { kind: 'call' | 'error'; tool: string; label: string; usd: number; tokens: number }
export type LoopTrip = {
  why: 'repeat' | 'oscillation' | 'error'
  tool: string
  /** how many times the repeated thing happened */
  count: number
  /** spent on the steps after the first one: the repeats themselves */
  usd: number
  tokens: number
  /** the repeated steps, oldest first, for "Show the repeats" */
  steps: { kind: 'call' | 'error'; tool: string; label: string }[]
}

const ISO = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?\b/g
const CLOCK = /\b\d{1,2}:\d{2}:\d{2}(\.\d+)?\b/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const TEMP = /(\/(?:private\/)?(?:var\/folders\/[^\s'"]+?\/T|tmp)\/)[^\s'"/]+/g
const EPOCH = /\b1\d{9}(\d{3})?\b/g

/** Same call, same text, once what changes every time (timestamps, temp folders, ids) is taken out. */
export function normalizeInput(s: string): string {
  return s.replace(ISO, '<time>').replace(CLOCK, '<time>').replace(UUID, '<id>').replace(TEMP, '$1<tmp>').replace(EPOCH, '<time>').replace(/\s+/g, ' ').trim()
}
/** An error's first line with every number taken out too (line numbers, pids, ports, durations). */
export function normalizeError(s: string): string {
  const first = s.split('\n').find((l) => l.trim()) ?? s
  return normalizeInput(first).replace(/\d+/g, '#').toLowerCase().slice(0, 300)
}

const stable = (v: unknown): string =>
  typeof v === 'string' ? JSON.stringify(v.replace(/\s+/g, ' ').trim()) : v === null || typeof v !== 'object' ? JSON.stringify(v) ?? '' : Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`

/** One call's signature: the tool and its input with keys sorted and volatile parts taken out. */
export const callSignature = (tool: string, input: unknown) => `${tool}\u0000${normalizeInput(typeof input === 'string' ? input : stable(input))}`

/** What one model message cost, from its usage and the price table. */
export function messageCost(model: string | undefined, u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }) {
  const inp = u.input_tokens ?? 0
  const out = u.output_tokens ?? 0
  const cr = u.cache_read_input_tokens ?? 0
  const cw = u.cache_creation_input_tokens ?? 0
  const p = priceFor(model ?? '', inp + cr + cw)
  return { usd: (inp * p.input + out * p.output + cr * p.cacheRead + cw * p.input * 1.25) / 1e6, tokens: inp + out + cr + cw }
}

export class LoopGuard {
  private calls: (LoopStep & { sig: string })[] = []
  private errs: (LoopStep & { sig: string })[] = []
  private pending = { usd: 0, tokens: 0 }
  /** everything spent this turn, so an error trip can take the part since its first error */
  private total = { usd: 0, tokens: 0 }
  private seenMsg = new Set<string>()
  constructor(public config: LoopConfig = LOOP_DEFAULTS) {}

  /** A new message from the person: what repeated before is not a loop of this turn. */
  reset() {
    this.calls = []
    this.errs = []
    this.pending = { usd: 0, tokens: 0 }
    this.total = { usd: 0, tokens: 0 }
    this.seenMsg.clear()
  }

  /** A model message's cost; it goes on the next tool call (the call that message asked for). One count per message id. */
  spend(usd: number, tokens: number, messageId?: string) {
    if (messageId) {
      if (this.seenMsg.has(messageId)) return
      this.seenMsg.add(messageId)
    }
    this.pending = { usd: this.pending.usd + usd, tokens: this.pending.tokens + tokens }
    this.total = { usd: this.total.usd + usd, tokens: this.total.tokens + tokens }
  }

  /** A tool call; a trip when it makes a loop. */
  call(tool: string, input: unknown, label = typeof input === 'string' ? input : stable(input)): LoopTrip | null {
    const step = { kind: 'call' as const, tool, label: label.slice(0, 200), sig: callSignature(tool, input), ...this.pending }
    this.pending = { usd: 0, tokens: 0 }
    const keep = Math.max(this.config.window, 6)
    this.calls = [...this.calls, step].slice(-keep)
    if (!this.config.on) return null
    const win = this.calls.slice(-this.config.window)
    const same = win.filter((c) => c.sig === step.sig)
    if (same.length >= this.config.repeats) return this.trip('repeat', tool, same.length, win.slice(win.indexOf(same[0]!)), (c) => c.sig === step.sig)
    // A, B, A, B, A, B: two different calls taking turns, three rounds
    const last = this.calls.slice(-6)
    if (last.length === 6 && last[0]!.sig !== last[1]!.sig && last.every((c, i) => c.sig === last[i % 2]!.sig))
      return this.trip('oscillation', `${last[0]!.tool} and ${last[1]!.tool}`, 3, last, () => true)
    return null
  }

  /** A failed tool result; a trip when the same error came back too many times in a row. */
  error(text: string, tool = this.calls.at(-1)?.tool ?? 'tool'): LoopTrip | null {
    const step = { kind: 'error' as const, tool, label: (text.split('\n').find((l) => l.trim()) ?? text).trim().slice(0, 200), sig: normalizeError(text), usd: this.total.usd, tokens: this.total.tokens }
    this.errs = [...this.errs, step].slice(-this.config.errors)
    if (!this.config.on || this.errs.length < this.config.errors || !this.errs.every((e) => e.sig === step.sig)) return null
    // spent since the first of these errors: the calls that brought the same error back
    const first = this.errs[0]!
    return { why: 'error', tool, count: this.errs.length, usd: this.total.usd - first.usd, tokens: this.total.tokens - first.tokens, steps: this.errs.map(({ kind, tool, label }) => ({ kind, tool, label })) }
  }

  private trip(why: LoopTrip['why'], tool: string, count: number, from: (LoopStep & { sig: string })[], shown: (s: LoopStep & { sig: string }) => boolean): LoopTrip {
    const repeats = from.slice(1)
    return { why, tool, count, usd: repeats.reduce((a, c) => a + c.usd, 0), tokens: repeats.reduce((a, c) => a + c.tokens, 0), steps: from.filter(shown).map(({ kind, tool, label }) => ({ kind, tool, label })) }
  }
}

/** The notice's first sentence. */
export function tripHeadline(t: Pick<LoopTrip, 'why' | 'tool' | 'count'>) {
  if (t.why === 'oscillation') return `Paused: ${t.tool} took turns ${t.count} times each.`
  if (t.why === 'error') return `Paused: the same ${t.tool} error came back ${t.count} times.`
  return `Paused: the same ${t.tool} call repeated ${t.count} times.`
}
