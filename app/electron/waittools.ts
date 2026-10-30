// `stm wait`, `stm state` and the panel_state / panel_wait tools. A wait sends nothing and spends
// nothing; acting after it (a message, an answer) goes through the tools that already have approvals.
import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { WaitCond } from '../shared/waitfor.js'
import { CycleError, type Hub } from './hub.js'
import { timeoutOf, WAIT_EXIT, type PanelRuntime } from './runtime.js'

export interface WaitDeps {
  rt: PanelRuntime
  hub: Hub
  /** panel id and display name of every open panel */
  names: () => { panel: string; name: string }[]
}

const CONDS = ['blocked', 'idle', 'done'] as const

function target(d: WaitDeps, ref: unknown): string {
  const r = String(ref ?? '').trim()
  if (!r) throw new Error('Name the panel: its id (s1) or its name.')
  const sid = d.rt.resolve(r, d.names)
  if (!sid) throw new Error(`No panel "${r}". Open panels: ${d.names().map((n) => `${n.panel} (${n.name})`).join(', ') || 'none'}.`)
  return sid
}

/** `stm state [<panel>]`: one panel, or all of them. */
export function stateOf(d: WaitDeps, ref?: unknown) {
  const name = (sid: string) => d.names().find((n) => n.panel === sid)?.name
  const row = (v: NonNullable<ReturnType<PanelRuntime['view']>>) => ({ panel: v.panel, name: name(v.panel), state: v.state, reason: v.reason, since: v.since })
  if (ref === undefined || ref === null || String(ref).trim() === '') return d.rt.states().map(row)
  return row(d.rt.view(target(d, ref))!)
}

export interface WaitReply {
  /** the exit code of stm wait: 0 met, 2 timeout, 3 closed, 4 cycle refused */
  code: number
  met: boolean
  panel: string
  state?: string
  reason?: string
  since?: number
  error?: string
}

/** `stm wait --for blocked|idle|done <panel> [--timeout 10m]`. `from` is the calling panel, when there is one. */
export async function runWait(d: WaitDeps, a: { from?: unknown; panel: unknown; for: unknown; timeout?: unknown }, signal?: AbortSignal): Promise<WaitReply> {
  const cond = String(a.for ?? '') as WaitCond
  if (!(CONDS as readonly string[]).includes(cond)) throw new Error('--for is blocked, idle or done.')
  const sec = timeoutOf(a.timeout)
  const sid = target(d, a.panel)
  const from = a.from ? String(a.from) : undefined
  let end: () => void
  try {
    end = d.hub.beginWait(from && d.rt.has(from) ? from : undefined, sid)
  } catch (e) {
    if (e instanceof CycleError) return { code: WAIT_EXIT.cycle, met: false, panel: sid, error: e.message }
    throw e
  }
  try {
    const r = await d.rt.wait(sid, cond, sec, signal)
    return { code: r.code, met: r.met, panel: sid, state: r.state, reason: r.reason, since: r.since }
  } finally {
    end()
  }
}

/** The two in-process tools of one panel's session. */
export function waitTools(d: WaitDeps, from: string) {
  const text = (t: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }], ...(isError ? { isError: true } : {}) })
  return [
    tool('panel_state', 'The state of another panel (or all): working, waiting_approval, waiting_input, idle, error or closed, with the reason and since when.', { panel: z.string().optional().describe('Panel id or name; leave out for all') }, async ({ panel }) => {
      try {
        return text(stateOf(d, panel))
      } catch (e) {
        return text(e instanceof Error ? e.message : String(e), true)
      }
    }),
    tool(
      'panel_wait',
      'Wait until another panel is blocked (needs approval, input, or failed), idle, or done (finished a turn after this call). Returns {met, state, reason}. Sends nothing to that panel. Refused when it already waits on this panel.',
      { panel: z.string().describe('Panel id or name'), for: z.enum(CONDS), timeoutSec: z.number().int().min(1).max(86_400).optional().describe('Default 600 (10 minutes), at most 24 hours') },
      async ({ panel, for: cond, timeoutSec }) => {
        try {
          const r = await runWait(d, { from, panel, for: cond, timeout: timeoutSec }, undefined)
          if (r.code === WAIT_EXIT.cycle) return text(r.error ?? 'Refused: would deadlock.', true)
          return text({ met: r.met, state: r.state, reason: r.reason, timedOut: r.code === WAIT_EXIT.timeout, closed: r.code === WAIT_EXIT.closed })
        } catch (e) {
          return text(e instanceof Error ? e.message : String(e), true)
        }
      },
    ),
  ]
}
