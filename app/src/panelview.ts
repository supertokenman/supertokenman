// How a panel's runtime state (shared/panelstate.ts, kept in main) shows in the UI: one mark per state,
// and the replay of a panel's buffered events into a window that was closed and opened again.
import type { MarkShape, MarkState } from './StateMark'

export type RuntimeState = 'working' | 'waiting_approval' | 'waiting_input' | 'idle' | 'error' | 'closed'
export type PanelRun = { state: RuntimeState; reason?: string; since: number }

export const STATE_WORDS: Record<RuntimeState, string> = {
  working: 'Working',
  waiting_approval: 'Waiting for your approval',
  waiting_input: 'Waiting for your answer',
  idle: 'Ready',
  error: 'Stopped',
  closed: 'Closed',
}

/** The mark of a state: the five states read differently by shape and colour, not by colour alone. */
export function markOf(s: PanelRun | undefined): { state: MarkState; shape?: MarkShape; label: string } | null {
  if (!s || s.state === 'closed') return null
  const word = STATE_WORDS[s.state]
  switch (s.state) {
    case 'working': return { state: 'busy', label: word }
    case 'waiting_approval': return { state: 'warn', shape: 'cut', label: word }
    case 'waiting_input': return { state: 'warn', shape: 'triangle', label: word }
    case 'error': return { state: 'down', label: s.reason ? `${word}: ${s.reason}` : word }
    case 'idle': return { state: 'up', label: word }
  }
}

/** The sheet of a snapshot that a new window needs for a panel it does not have yet. */
export type ReplayPanel = { panel: string; state: RuntimeState; log: unknown[] }

export function replayOpen(p: ReplayPanel): { sid: string; cwd: string; model: string } | null {
  if (p.state === 'closed') return null
  const ready = [...p.log].reverse().find((e): e is { kind: 'ready'; cwd: string; model: string } => (e as { kind?: string })?.kind === 'ready')
  return { sid: p.panel, cwd: ready?.cwd ?? '', model: ready?.model ?? '' }
}

/** Panels the window does not hold yet; the ones it holds keep their own transcript. */
export function missingPanels(snapshot: ReplayPanel[], have: string[]): ReplayPanel[] {
  const known = new Set(have)
  return snapshot.filter((p) => !known.has(p.panel) && p.state !== 'closed')
}

/** The update gate in main answers with a sentence; this reads how many panels it would stop. */
export function gateCount(step: string): number {
  const m = /^Restarting now stops (\d+|1) panels?\b/.exec(step)
  return m ? Number(m[1]) : 0
}
