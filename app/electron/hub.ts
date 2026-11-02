// Panels talking to each other: each session gets two tools, list_panels and message_panel.
// A message runs as a turn in the target panel and its reply comes back as the tool's result.
// Waits form a graph; a message that would close a cycle (A waits on B, B on A) is refused.
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/** What the hub needs of a panel's session. */
/** lastSign: when the panel last showed a sign of work (any event but the message itself); a message with none in START_MS fails. */
export type Peer = { label: string; cwd: string; busy: () => boolean; ask: (text: string, from: string) => Promise<string>; lastSign?: () => number; asking?: () => boolean }

export const SERVER = 'panels'
export const TOOLS = [`mcp__${SERVER}__list_panels`, `mcp__${SERVER}__message_panel`, `mcp__${SERVER}__panel_state`, `mcp__${SERVER}__panel_wait`]
type ExtraTools = NonNullable<Parameters<typeof createSdkMcpServer>[0]['tools']>
const TIMEOUT_MS = 15 * 60 * 1000
export const START_MS = 90 * 1000

export type WaitItem = { panel: string; name: string; state: string }

export class CycleError extends Error {
  constructor(from: string, to: string) {
    super(from === to ? 'A panel cannot wait on itself.' : `Panel "${to}" is waiting on this panel; waiting on it would deadlock both.`)
  }
}

export class Hub {
  private peers = new Map<string, Peer>()
  /** who is waiting on whom */
  private waits = new Map<string, string>()
  /** more tools for a panel's server (panel_state, panel_wait), set by the app */
  extraTools?: (from: string) => ExtraTools
  /** called before a message goes out, e.g. to make the target the sender's worker when the sender is a lead */
  onMessage?: (from: string, to: string, text: string) => void
  startMs = START_MS
  /** a sender's messages in flight and how far each target got, on every change and every few seconds; [] when none is left */
  onWait?: (from: string, items: WaitItem[]) => void
  /** a message_panel call that failed, so the sender's panel shows why and not only its agent */
  onFail?: (from: string, to: string, error: string) => void
  private flights = new Map<string, Map<string, { sent: number; end?: 'done' | 'failed' }>>()
  private ticker?: ReturnType<typeof setInterval>

  /** How far a message to `to` got: not started, needs approval, working, done or failed. */
  private stateOf(to: string, f: { sent: number; end?: 'done' | 'failed' }): string {
    if (f.end) return f.end
    const p = this.peers.get(to)
    if (!p) return 'closed'
    if (p.asking?.()) return 'needs approval'
    return p.lastSign && p.lastSign() < f.sent ? 'not started' : 'working'
  }
  private report(from: string) {
    const m = this.flights.get(from)
    const live = m && ![...m.values()].every((f) => f.end)
    const items = live ? [...m].map(([panel, f]) => ({ panel, name: this.peers.get(panel)?.label ?? panel, state: this.stateOf(panel, f) })) : []
    if (m && !live) this.flights.delete(from)
    try {
      this.onWait?.(from, items)
    } catch {
      // the spinner is a view; the message goes on without it
    }
    if (!this.flights.size && this.ticker) (clearInterval(this.ticker), (this.ticker = undefined))
  }
  private track(from: string, to: string) {
    const m = this.flights.get(from) ?? new Map<string, { sent: number; end?: 'done' | 'failed' }>()
    m.set(to, { sent: Date.now() })
    this.flights.set(from, m)
    this.ticker ??= setInterval(() => [...this.flights.keys()].forEach((f) => this.report(f)), 2000)
    this.report(from)
  }
  private land(from: string, to: string, ok: boolean) {
    const f = this.flights.get(from)?.get(to)
    if (f) f.end = ok ? 'done' : 'failed'
    this.report(from)
  }

  add(sid: string, peer: Peer) {
    this.peers.set(sid, peer)
  }

  remove(sid: string) {
    this.peers.delete(sid)
    this.waits.delete(sid)
  }

  list(from: string) {
    return [...this.peers].filter(([sid]) => sid !== from).map(([sid, p]) => ({ panel: sid, name: p.label, folder: p.cwd, busy: p.busy() }))
  }

  /** True when `to` already waits, directly or not, on `from`. */
  wouldCycle(from: string, to: string) {
    let cur: string | undefined = to
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      if (cur === from) return true
      seen.add(cur)
      cur = this.waits.get(cur)
    }
    return false
  }

  /**
   * Records that `from` waits on `to` (stm wait / panel_wait) and returns the call that ends it. Throws
   * when `to` already waits, directly or not, on `from`: A waits B waits A would never end. A caller
   * that is not a panel (the command line from outside) has no edge and cannot close a cycle.
   */
  beginWait(from: string | undefined, to: string): () => void {
    if (!from) return () => undefined
    if (from === to || this.wouldCycle(from, to)) throw new CycleError(from, to)
    this.waits.set(from, to)
    return () => {
      if (this.waits.get(from) === to) this.waits.delete(from)
    }
  }

  /** Sends `text` from one panel to another and resolves with the target's reply. */
  async message(from: string, to: string, text: string): Promise<string> {
    const target = this.peers.get(to)
    if (!target) throw new Error(`No panel "${to}". Call list_panels to see the open panels.`)
    if (to === from) throw new Error('A panel cannot message itself.')
    if (this.wouldCycle(from, to)) throw new Error(`Panel "${to}" is waiting on this panel; messaging it would deadlock both.`)
    this.waits.set(from, to)
    let timer: ReturnType<typeof setTimeout> | undefined
    let watch: ReturnType<typeof setInterval> | undefined
    try {
      const sender = this.peers.get(from)?.label ?? from
      this.onMessage?.(from, to, text)
      const sent = Date.now()
      this.track(from, to)
      let ok = false
      try {
        const reply = await Promise.race([
          target.ask(text, sender),
          new Promise<string>((_, reject) => (timer = setTimeout(() => reject(new Error(`Panel "${to}" did not answer within 15 minutes.`)), TIMEOUT_MS))),
          // a panel that never starts the turn (no sign at all) fails fast instead of holding the sender for 15 minutes
          new Promise<string>((_, reject) => {
            if (!target.lastSign) return
            watch = setInterval(() => {
              if (target.lastSign!() >= sent) return clearInterval(watch)
              if (Date.now() - sent >= this.startMs) reject(new Error(`Panel "${to}" did not start the task in ${Math.round(this.startMs / 1000)} seconds. Look at that panel: it may be waiting for a sign-in, an approval or a model. Nothing else was sent.`))
            }, Math.min(5000, this.startMs / 3))
          }),
        ])
        ok = true
        return reply
      } finally {
        this.land(from, to, ok)
      }
    } finally {
      clearTimeout(timer)
      clearInterval(watch)
      this.waits.delete(from)
    }
  }

  /** The tools one panel's session gets. */
  server(from: string): McpSdkServerConfigWithInstance {
    const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
    return createSdkMcpServer({
      name: SERVER,
      instructions: 'Other Claude Code sessions run in panels of the same app, each in its own folder. Use list_panels to see them and message_panel to ask one a question; its reply comes back as the result. When this panel is a Lead handing work to workers, use mcp__stm__delegate and mcp__stm__collect instead: they mark the worker, draw the link and track its result.',
      tools: [
        tool('list_panels', 'List the other open panels: id, name, folder and whether each is busy.', {}, async () => text(JSON.stringify(this.list(from), null, 2))),
        tool(
          'message_panel',
          'Send a question or a small task to another panel. It runs there as a turn and its final reply is returned. Be specific: the other panel does not see this conversation. A lead giving work to workers should use mcp__stm__delegate instead; a message from a lead still makes the target its worker.',
          { panel: z.string().describe('Panel id from list_panels, e.g. s2'), message: z.string().describe('What the other panel should do or answer') },
          async ({ panel, message }) => {
            try {
              return text(await this.message(from, panel, message))
            } catch (err) {
              const why = err instanceof Error ? err.message : String(err)
              this.onFail?.(from, panel, why)
              return { ...text(why), isError: true }
            }
          },
        ),
        ...(this.extraTools?.(from) ?? []),
      ],
    })
  }
}
