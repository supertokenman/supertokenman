// A trigger's run: its prompt split into steps (separated by a line with ---), each sent when the one
// before finishes. A step that starts with [ask] waits for the person's go. Runs are kept, so one
// stopped by a restart can be resumed from the step it was on.

export type Step = { text: string; gate: boolean }
export type Run = { id: string; trigger: string; name: string; step: number; of: number; at: number; state: 'running' | 'waiting' | 'paused' | 'done' | 'skipped' }

export function stepsOf(prompt: string, gateAll = false): Step[] {
  return prompt
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const gate = /^\[ask\]\s*/i.test(s)
      return { text: s.replace(/^\[ask\]\s*/i, ''), gate: gate || (gateAll && i === 0) }
    })
}

/** Runs that a restart left unfinished: shown with Resume. */
export const unfinished = (runs: Run[]) => runs.filter((r) => r.state === 'running' || r.state === 'waiting' || r.state === 'paused')
