// Per-panel runtime state kept in the main process: the classified state (shared/panelstate.ts), a
// bounded event log for replay when a window is opened again, and the waiters behind `stm wait`.
// No Electron here, so a test drives it with plain events.
import { EventRing } from '../shared/eventring.js'
import { classify, fromUi, initialPanel, type Panel, type PanelState, type Signal, type UiLike } from '../shared/panelstate.js'
import { parseTimeout, waitOutcome, type WaitCond } from '../shared/waitfor.js'

export interface PanelView {
  panel: string
  state: PanelState
  reason?: string
  /** ms since the epoch when the state last changed */
  since: number
  /** turns ended so far */
  turn: number
  /** approvals waiting */
  pending: number
}

export interface PanelSnapshot extends PanelView {
  log: unknown[]
}

/** Exit codes of `stm wait`. */
export const WAIT_EXIT = { met: 0, error: 1, timeout: 2, closed: 3, cycle: 4 } as const

export interface WaitResult {
  code: 0 | 2 | 3
  met: boolean
  state: PanelState
  reason?: string
  since: number
}

interface Entry {
  panel: Panel
  since: number
  turn: number
  approvals: Set<string>
  ring: EventRing<unknown>
}

export class PanelRuntime {
  private entries = new Map<string, Entry>()
  private listeners = new Set<(sid: string) => void>()

  constructor(
    private opts: { now?: () => number; onState?: (view: PanelView) => void; maxEvents?: number; maxBytes?: number } = {},
  ) {}

  private now() {
    return (this.opts.now ?? Date.now)()
  }

  open(sid: string): PanelView {
    const e: Entry = {
      panel: initialPanel(),
      since: this.now(),
      turn: 0,
      approvals: new Set(),
      ring: new EventRing({ maxEvents: this.opts.maxEvents, maxBytes: this.opts.maxBytes }),
    }
    this.entries.set(sid, e)
    return this.viewOf(sid, e)
  }

  has(sid: string): boolean {
    return this.entries.has(sid)
  }

  private viewOf(sid: string, e: Entry): PanelView {
    return { panel: sid, state: e.panel.state, reason: e.panel.reason, since: e.since, turn: e.turn, pending: e.panel.pending }
  }

  view(sid: string): PanelView | null {
    const e = this.entries.get(sid)
    return e ? this.viewOf(sid, e) : null
  }

  states(): PanelView[] {
    return [...this.entries].map(([sid, e]) => this.viewOf(sid, e))
  }

  private apply(sid: string, e: Entry, next: Panel) {
    const changed = next.state !== e.panel.state || next.reason !== e.panel.reason || next.pending !== e.panel.pending
    if (next.state !== e.panel.state) e.since = this.now()
    e.panel = next
    if (!changed) return
    const v = this.viewOf(sid, e)
    this.opts.onState?.(v)
    for (const l of [...this.listeners]) l(sid)
  }

  /** A signal from the app: a prompt sent, a sleep, an exit, a disconnect, a quota hold. */
  signal(sid: string, sig: Signal): void {
    const e = this.entries.get(sid)
    if (!e) return
    if (sig.kind === 'closed') {
      e.approvals.clear()
      return this.apply(sid, e, classify(e.panel, sig))
    }
    this.apply(sid, e, classify(e.panel, sig))
  }

  /** One event on its way to the window: classified, and kept for replay (already masked by the caller). */
  event(sid: string, ev: UiLike, masked: unknown = ev): void {
    const e = this.entries.get(sid)
    if (!e) return
    if (ev.kind === 'permission') {
      const id = (ev as { id?: string }).id
      if (id) e.approvals.add(id)
      this.apply(sid, e, classify(e.panel, { kind: 'approval', pending: e.approvals.size }))
    } else {
      if (ev.kind === 'turn') {
        e.turn++
        // a turn that ended leaves no approval open
        e.approvals.clear()
        e.panel = { ...e.panel, pending: 0 }
      }
      this.apply(sid, e, fromUi(e.panel, ev))
    }
    e.ring.push(masked)
  }

  /** The person (or the phone) answered an approval. */
  approvalDone(sid: string, id: string): void {
    const e = this.entries.get(sid)
    if (!e || !e.approvals.delete(id)) return
    this.apply(sid, e, classify(e.panel, { kind: 'approval', pending: e.approvals.size }))
  }

  close(sid: string): void {
    this.signal(sid, { kind: 'closed' })
    this.entries.delete(sid)
  }

  /** Panels that work or wait for an approval: what keeps the app in the background. */
  live(): number {
    let n = 0
    for (const e of this.entries.values()) if (e.panel.state === 'working' || e.panel.state === 'waiting_approval') n++
    return n
  }

  /** Panels that need the person: waiting for an approval, for input, or broken. */
  needsYou(): number {
    let n = 0
    for (const e of this.entries.values()) if (e.panel.state === 'waiting_approval' || e.panel.state === 'waiting_input' || e.panel.state === 'error') n++
    return n
  }

  snapshot(): { at: number; panels: PanelSnapshot[] } {
    return { at: this.now(), panels: [...this.entries].map(([sid, e]) => ({ ...this.viewOf(sid, e), log: e.ring.toArray() })) }
  }

  /** The replay log of one panel (oldest first). */
  log(sid: string): unknown[] {
    return this.entries.get(sid)?.ring.toArray() ?? []
  }

  /**
   * Waits until the condition holds. A wait sends nothing. Resolves with code 0 when met, 2 on timeout,
   * 3 when the panel closed first. `signal` abandons the wait (the caller went away).
   */
  wait(sid: string, cond: WaitCond, timeoutSec: number, signal?: AbortSignal): Promise<WaitResult> {
    const e0 = this.entries.get(sid)
    if (!e0) return Promise.reject(new Error(`No panel "${sid}".`))
    const sinceTurn = e0.turn
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (code: 0 | 2 | 3, met: boolean) => {
        clearTimeout(timer)
        this.listeners.delete(check)
        signal?.removeEventListener('abort', onAbort)
        const v = this.view(sid)
        resolve({ code, met, state: v?.state ?? 'closed', reason: v?.reason, since: v?.since ?? this.now() })
      }
      const check = (changed?: string) => {
        if (changed !== undefined && changed !== sid) return
        const e = this.entries.get(sid)
        const state: PanelState = e ? e.panel.state : 'closed'
        const out = waitOutcome(cond, { state, turn: e?.turn ?? e0.turn }, sinceTurn)
        if (out === 'met') finish(0, true)
        else if (out === 'closed') finish(3, false)
      }
      const onAbort = () => {
        clearTimeout(timer)
        this.listeners.delete(check)
        reject(new Error('Wait cancelled.'))
      }
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => finish(2, false), timeoutSec * 1000)
      this.listeners.add(check)
      check()
    })
  }

  /** A panel by id or by name (case-insensitive, exact). Null when none or several share the name. */
  resolve(ref: string, names: () => { panel: string; name: string }[]): string | null {
    const r = ref.trim()
    if (this.entries.has(r)) return r
    const hits = names().filter((n) => n.name.toLowerCase() === r.toLowerCase() && this.entries.has(n.panel))
    return hits.length === 1 ? hits[0]!.panel : null
  }
}

/** Timeout seconds from a CLI string ("10m"), or a number of seconds from MCP. Throws on nonsense. */
export function timeoutOf(v: unknown): number {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) throw new Error('timeout must be a positive number of seconds.')
    return Math.min(Math.floor(v), 24 * 3600)
  }
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return timeoutOf(Number(v))
  const sec = parseTimeout(v === undefined || v === null ? undefined : String(v))
  if (sec === null) throw new Error('timeout looks like 90s, 10m or 2h (at most 24h).')
  return sec
}
