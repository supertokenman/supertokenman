// Wait conditions for `stm wait` / `panel_wait`. Pure: no I/O.

import { blocked, type PanelState } from './panelstate'

export type WaitCond = 'blocked' | 'idle' | 'done'

export interface WaitCurrent {
  state: PanelState
  /** count of turns that have ended so far */
  turn: number
}

export type WaitOutcome = 'met' | 'pending' | 'closed'

export const WAIT_DEFAULT_SEC = 600
export const WAIT_MAX_SEC = 24 * 60 * 60


/**
 * blocked: already blocked (met at once).
 * idle: already idle (met at once).
 * done: idle after at least one turn ended since the wait began.
 * A closed panel meets `done`; otherwise it is reported as 'closed'.
 */
export function waitOutcome(cond: WaitCond, cur: WaitCurrent, sinceTurn: number): WaitOutcome {
  const { state, turn } = cur
  if (cond === 'blocked') return blocked(state) ? 'met' : state === 'closed' ? 'closed' : 'pending'
  if (cond === 'idle') return state === 'idle' ? 'met' : state === 'closed' ? 'closed' : 'pending'
  if (state === 'closed') return 'met'
  return state === 'idle' && turn > sinceTurn ? 'met' : 'pending'
}

export function waitDone(cond: WaitCond, cur: WaitCurrent, sinceTurn: number): boolean {
  return waitOutcome(cond, cur, sinceTurn) === 'met'
}

/**
 * Parses "90s", "10m", "2h" (positive integer + unit). Empty or undefined gives the
 * default (10 min). Values above 24 h are clamped to 24 h. Anything else gives null.
 */
export function parseTimeout(input?: string): number | null {
  if (input === undefined || input.trim() === '') return WAIT_DEFAULT_SEC
  const m = /^(\d+)\s*([smh])$/.exec(input.trim())
  if (!m) return null
  const n = Number(m[1])
  if (n <= 0) return null
  const sec = n * (m[2] === 's' ? 1 : m[2] === 'm' ? 60 : 3600)
  return Math.min(sec, WAIT_MAX_SEC)
}
