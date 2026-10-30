// Pure logic of the lead panel: one panel plans and the others execute. Which worker takes a task, what
// an edge on the canvas shows, and how a worker's answer is cut down before it reaches the lead.
// No Electron here, so it is tested on its own.

export const MAX_WORKERS = 6
/** How much of a worker's answer goes to the lead in one piece. */
export const RESULT_MAX = 3000
/** The one-line version shown in the lead's chat stream. */
export const LINE_MAX = 240

export type WorkerInfo = { id: string; folder: string; busy: boolean; lead: string | null }
export type Plan = { kind: 'reuse'; id: string } | { kind: 'open'; folder: string } | { kind: 'refuse'; reason: string }

/**
 * Where a task goes: an idle worker the lead owns in the same folder, or a new panel. A worktree task
 * always gets a new panel, since it must not share a folder. Depth is 1: a worker never delegates, and
 * a lead is never a worker.
 */
export function planDelegation(a: { lead: string; leadFolder: string; folder?: string; worktree?: boolean; panels: WorkerInfo[]; leads: ReadonlySet<string> }): Plan {
  const me = a.panels.find((p) => p.id === a.lead)
  if (!a.leads.has(a.lead)) return { kind: 'refuse', reason: 'This panel is not the lead. The person makes a panel Lead from its "..." menu.' }
  if (me?.lead) return { kind: 'refuse', reason: 'Workers do not delegate further. Answer the lead.' }
  const folder = (a.folder?.trim() || a.leadFolder).replace(/\/+$/, '')
  const mine = a.panels.filter((p) => p.lead === a.lead)
  if (!a.worktree) {
    const idle = mine.find((p) => !p.busy && p.folder.replace(/\/+$/, '') === folder)
    if (idle) return { kind: 'reuse', id: idle.id }
  }
  if (mine.length >= MAX_WORKERS) return { kind: 'refuse', reason: `The lead already has ${mine.length} workers (the most is ${MAX_WORKERS}). Collect or reuse one.` }
  return { kind: 'open', folder }
}

export type EdgeStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'

/** What an edge shows. An error wins over everything; a pending question or approval is waiting. */
export function edgeStatus(w: { busy: boolean; asking?: boolean; error?: boolean; finished?: boolean; hasTask: boolean }): EdgeStatus {
  if (w.error) return 'error'
  if (w.asking) return 'waiting'
  if (w.busy) return 'working'
  if (w.finished) return 'done'
  return w.hasTask ? 'waiting' : 'idle'
}

/** Whether a pulse should be in flight: only while something travels. */
export const traffic = (s: EdgeStatus) => s === 'working'

/** Text cut at a word where it can be, with a mark that it was cut. */
export function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, Math.max(1, max - 1))
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`
}

export type Result = { id: string; name: string; text: string; isError: boolean; files: string[]; costUsd: number }

/** What the lead reads for one worker: the answer, the files it touched and what it cost. */
export function summarizeResult(r: Result, max = RESULT_MAX): string {
  const files = r.files.length ? `Files changed (${r.files.length}): ${r.files.slice(0, 12).join(', ')}${r.files.length > 12 ? `, and ${r.files.length - 12} more` : ''}.` : 'No files changed.'
  const head = `${r.name} (${r.id}) ${r.isError ? 'ended with an error' : 'finished'}.`
  return [head, truncate(r.text || '(no answer)', max), files, `Cost: $${r.costUsd.toFixed(2)}.`].join('\n')
}

/** The compact message in the lead's chat stream. */
export function finishedLine(r: Result): string {
  const first = r.text.trim().split('\n').find(Boolean) ?? ''
  return `${r.name} ${r.isError ? 'stopped with an error' : 'finished'}: ${truncate(first, LINE_MAX)}`
}

/** A short card title from the task text. */
export const taskTitle = (task: string) => truncate(task.trim().split('\n')[0] ?? '', 48)

export const WORKER_RULE = (lead: string) => `# You are a worker of the lead panel "${lead}"
The lead plans; you carry out one task and report back. Do only the task you were given. Finish with a short result: what you did, the files you changed, and anything that blocks you. Do not delegate to other panels and do not open panels: only the lead does. If you are blocked, say so in one line and stop.`
