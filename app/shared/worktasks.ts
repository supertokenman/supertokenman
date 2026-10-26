// Tasks: one unit of work that can span panels (a fan-out, a follow-up, a reviewer), with its own budget
// and a timeline of what happened: panels linked, turns and their cost, alerts, and the final decision.
// Crossing 50% and 80% of the budget tells every panel of the task; at 100% they all hold.
// Idea from Paperclip's per-task budgets; our own code.

export type TaskEvent = { at: number; kind: 'open' | 'link' | 'unlink' | 'turn' | 'alert' | 'held' | 'decision'; text: string; usd?: number; sid?: string }
export type WorkTask = { id: string; title: string; goal: string; budgetUsd: number; sids: string[]; spent: number; events: TaskEvent[]; status: 'open' | 'done'; decision?: string; at: number; alerted: number[] }

export const ALERTS = [50, 80, 100]

export const newTask = (id: string, title: string, goal: string, budgetUsd: number, now: number): WorkTask => ({ id, title: title.trim() || 'Untitled task', goal: goal.trim(), budgetUsd: Math.max(0, budgetUsd), sids: [], spent: 0, events: [{ at: now, kind: 'open', text: `Opened${budgetUsd > 0 ? ` with a budget of US$ ${budgetUsd.toFixed(2)}` : ' with no budget'}.` }], status: 'open', at: now, alerted: [] })

export function link(t: WorkTask, sid: string, label: string, now: number): WorkTask {
  if (t.sids.includes(sid)) return t
  return { ...t, sids: [...t.sids, sid], events: [...t.events, { at: now, kind: 'link', sid, text: `Panel ${label} joined.` }] }
}
export function unlink(t: WorkTask, sid: string, label: string, now: number): WorkTask {
  if (!t.sids.includes(sid)) return t
  return { ...t, sids: t.sids.filter((x) => x !== sid), events: [...t.events, { at: now, kind: 'unlink', sid, text: `Panel ${label} left.` }] }
}

/** A turn's cost added; returns the alerts newly crossed (50, 80, 100), each said once. */
export function addTurn(t: WorkTask, sid: string, usd: number, label: string, now: number): { task: WorkTask; alerts: number[] } {
  if (!(usd > 0)) return { task: t, alerts: [] }
  const spent = t.spent + usd
  const events: TaskEvent[] = [...t.events, { at: now, kind: 'turn', sid, usd, text: `A turn in ${label}.` }]
  const alerts = t.budgetUsd > 0 ? ALERTS.filter((p) => !t.alerted.includes(p) && spent >= (t.budgetUsd * p) / 100) : []
  for (const p of alerts) events.push({ at: now, kind: 'alert', text: p >= 100 ? `The budget is spent (US$ ${spent.toFixed(2)} of ${t.budgetUsd.toFixed(2)}): every panel of the task holds.` : `${p}% of the budget is spent (US$ ${spent.toFixed(2)} of ${t.budgetUsd.toFixed(2)}).` })
  return { task: { ...t, spent, events: events.slice(-500), alerted: [...t.alerted, ...alerts] }, alerts }
}

/** Whether a panel of the task may take another turn. */
export function taskVerdict(t: WorkTask, estimateUsd: number): { ok: true } | { ok: false; spent: number; limit: number; reason: string } {
  if (t.status !== 'open' || !(t.budgetUsd > 0)) return { ok: true }
  if (t.spent + estimateUsd > t.budgetUsd) return { ok: false, spent: t.spent, limit: t.budgetUsd, reason: `The budget for the task "${t.title}" is US$ ${t.budgetUsd.toFixed(2)}; US$ ${t.spent.toFixed(2)} is spent.` }
  return { ok: true }
}

export function decide(t: WorkTask, decision: string, now: number): WorkTask {
  return { ...t, status: 'done', decision: decision.trim(), events: [...t.events, { at: now, kind: 'decision', text: decision.trim() || 'Closed.' }] }
}

/** Spend per panel, for the task's breakdown. */
export const byPanel = (t: WorkTask) => t.events.filter((e) => e.kind === 'turn' && e.sid).reduce<Record<string, number>>((m, e) => ((m[e.sid!] = (m[e.sid!] ?? 0) + (e.usd ?? 0)), m), {})
