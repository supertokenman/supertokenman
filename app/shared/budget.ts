// Budgets with a brake: how much a panel, a project or a persona may spend, and what happens near the
// limit. Pure functions over a small ledger; the main process keeps the ledger and holds a message
// that would cross a limit until the person lets it through.

/** Limits in US dollars, as Claude Code reports a turn's cost. Unset means no limit. */
export type Limits = {
  /** one panel, from when it opened */
  panelUsd?: number
  /** one project folder, per day */
  projectDayUsd?: number
  /** one persona, per day, across its panels */
  personaDayUsd?: number
  /** a single turn expected to cost more than this asks first */
  approveTurnUsd?: number
  /** the share of a limit at which the panel is warned, 0..1 */
  warnAt?: number
}

/** What was spent today, by project folder and by persona id. */
export type Spend = { day: string; project: Record<string, number>; persona: Record<string, number> }

export const emptySpend = (day: string): Spend => ({ day, project: {}, persona: {} })
export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A turn's cost added to today's ledger; a new day starts from zero. */
export function addSpend(s: Spend, day: string, project: string, persona: string | undefined, usd: number): Spend {
  const base = s.day === day ? s : emptySpend(day)
  if (!(usd > 0)) return base
  return {
    day,
    project: { ...base.project, [project]: (base.project[project] ?? 0) + usd },
    persona: persona ? { ...base.persona, [persona]: (base.persona[persona] ?? 0) + usd } : base.persona,
  }
}

/** The next turn's likely cost: the median of the panel's recent turns, so one big turn does not decide. */
export function estimateTurn(recent: number[]): number {
  const xs = recent.filter((x) => x > 0).slice(-5).sort((a, b) => a - b)
  if (!xs.length) return 0
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2
}

export type Where = { project: string; persona?: string; panelUsd: number; estimateUsd: number }
export type Verdict =
  | { ok: true; warn?: string }
  | { ok: false; scope: 'panel' | 'project' | 'persona' | 'turn' | 'task'; reason: string; spent: number; limit: number; estimate: number }

const money = (usd: number) => `US$ ${usd < 1 ? usd.toFixed(3) : usd.toFixed(2)}`

/**
 * Whether the next message may go: held when what was spent plus the expected turn crosses a limit,
 * or when the turn alone is expected to cost more than the approval threshold; a warning near a limit.
 */
export function checkBudget(limits: Limits, spend: Spend, day: string, w: Where): Verdict {
  const today = spend.day === day ? spend : emptySpend(day)
  const scopes: { scope: 'panel' | 'project' | 'persona'; spent: number; limit?: number; label: string }[] = [
    { scope: 'panel', spent: w.panelUsd, limit: limits.panelUsd, label: 'this panel' },
    { scope: 'project', spent: today.project[w.project] ?? 0, limit: limits.projectDayUsd, label: 'this project today' },
    { scope: 'persona', spent: w.persona ? (today.persona[w.persona] ?? 0) : 0, limit: w.persona ? limits.personaDayUsd : undefined, label: 'this persona today' },
  ]
  for (const s of scopes) {
    if (!s.limit) continue
    if (s.spent + w.estimateUsd > s.limit) return { ok: false, scope: s.scope, spent: s.spent, limit: s.limit, estimate: w.estimateUsd, reason: `The budget for ${s.label} is ${money(s.limit)}; ${money(s.spent)} is spent and the next turn is likely about ${money(w.estimateUsd)}.` }
  }
  if (limits.approveTurnUsd && w.estimateUsd > limits.approveTurnUsd)
    return { ok: false, scope: 'turn', spent: 0, limit: limits.approveTurnUsd, estimate: w.estimateUsd, reason: `The next turn is likely about ${money(w.estimateUsd)}, more than the ${money(limits.approveTurnUsd)} that asks first.` }
  const warnAt = limits.warnAt ?? 0.8
  for (const s of scopes) if (s.limit && s.spent >= s.limit * warnAt) return { ok: true, warn: `${Math.round((s.spent / s.limit) * 100)}% of the budget for ${s.label} is spent (${money(s.spent)} of ${money(s.limit)}).` }
  return { ok: true }
}

/** The words for a held message, in whatever currency the window shows. */
export function heldText(h: { scope: 'panel' | 'project' | 'persona' | 'turn' | 'task'; spent: number; limit: number; estimate: number }, money: (usd: number) => string) {
  if (h.scope === 'turn') return `The next turn is likely about ${money(h.estimate)}, more than the ${money(h.limit)} that asks first.`
  const what = h.scope === 'task' ? 'this task' : h.scope === 'panel' ? 'this panel' : h.scope === 'project' ? 'this project today' : 'this persona today'
  return `The budget for ${what} is ${money(h.limit)}; ${money(h.spent)} is spent and the next turn is likely about ${money(h.estimate)}.`
}
