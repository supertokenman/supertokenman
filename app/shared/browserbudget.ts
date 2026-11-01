// Budget for one agent browser task: steps, wall time, screenshots and new hosts. Pure: the caller passes
// the clock. A spend past a limit is refused and ends the task with the reason, which the caller shows
// to the person as the task summary. Once ended, every later spend is refused with the same reason.

export type BudgetLimits = {
  steps: number
  wallMs: number
  screenshots: number
  newHosts: number
}

export const DEFAULT_LIMITS: BudgetLimits = { steps: 30, wallMs: 10 * 60_000, screenshots: 10, newHosts: 5 }

export type BudgetReason = 'steps' | 'wall-time' | 'screenshots' | 'new-hosts'
export type SpendKind = 'step' | 'screenshot' | 'newHost'

export type Budget = {
  readonly limits: BudgetLimits
  readonly started: number
  readonly steps: number
  readonly screenshots: number
  readonly newHosts: number
  /** set once a limit was hit; the task is over */
  readonly ended?: BudgetReason
}

export type SpendResult = { budget: Budget; stop: BudgetReason | null }

export function startBudget(now: number, limits: Partial<BudgetLimits> = {}): Budget {
  return { limits: { ...DEFAULT_LIMITS, ...limits }, started: now, steps: 0, screenshots: 0, newHosts: 0 }
}

const KIND: Record<SpendKind, { count: 'steps' | 'screenshots' | 'newHosts'; reason: BudgetReason; limit: keyof BudgetLimits }> = {
  step: { count: 'steps', reason: 'steps', limit: 'steps' },
  screenshot: { count: 'screenshots', reason: 'screenshots', limit: 'screenshots' },
  newHost: { count: 'newHosts', reason: 'new-hosts', limit: 'newHosts' },
}

/**
 * Spends one unit of `kind` at time `now`. Returns the new budget and the reason the task stops, or null.
 * A refused spend does not count. The wall clock is checked on every spend.
 */
export function spend(b: Budget, kind: SpendKind, now: number): SpendResult {
  if (b.ended) return { budget: b, stop: b.ended }
  if (now - b.started >= b.limits.wallMs) return { budget: { ...b, ended: 'wall-time' }, stop: 'wall-time' }
  const k = KIND[kind]
  const next = b[k.count] + 1
  if (next > b.limits[k.limit]) return { budget: { ...b, ended: k.reason }, stop: k.reason }
  return { budget: { ...b, [k.count]: next }, stop: null }
}

/** A line for the person: what was used and why the task ended. */
export function summarize(b: Budget): string {
  const used = `${b.steps}/${b.limits.steps} steps, ${b.screenshots}/${b.limits.screenshots} screenshots, ${b.newHosts}/${b.limits.newHosts} new hosts`
  const why: Record<BudgetReason, string> = {
    steps: 'the step limit was reached',
    'wall-time': 'the time limit was reached',
    screenshots: 'the screenshot limit was reached',
    'new-hosts': 'the new-host limit was reached',
  }
  return b.ended ? `Stopped: ${why[b.ended]}. ${used}.` : `Within budget. ${used}.`
}
