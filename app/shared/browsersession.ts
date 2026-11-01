// The agent browser's per-panel session state and the rules around it. Pure: no electron, no fs, the caller
// passes the clock. It joins the wave 1 pieces (host decision, budget, element revision) into the few
// decisions the main process needs:
//   - gateNavigation: may this URL open, must the person be asked, or is it refused (private address, rule)
//   - admit: the person's answer, and the new-host budget it spends
//   - taint: page text read by the model marks the whole session; in a tainted session a new host still asks
//     (an ask never resolves to allow by itself) but "always" is not offered and no rule is written
//   - revision: every element list has a revision; an action must name the latest one
//   - fence: everything that comes from a page is wrapped as untrusted before the model sees it
import { alwaysRule, hostDecision, type HostOptions } from './browserhost.js'
import { spend, startBudget, summarize, type Budget, type BudgetLimits, type BudgetReason, type SpendKind } from './browserbudget.js'
import type { ActionContext } from './browseraction.js'

export type Session = {
  readonly budget: Budget
  /** page text reached the model in this session; never cleared */
  readonly tainted: boolean
  /** the person has the browser: agent actions return "the person has the browser" */
  readonly held: boolean
  readonly revision: number
  /** node ids of the last element list, to mark new elements in the next one */
  readonly elementIds?: number[]
  readonly count: number
  /** hosts the person allowed once in this session */
  readonly allowed: readonly string[]
  /** hosts that were opened (and counted against the new-host budget) */
  readonly seen: readonly string[]
  readonly tabs: readonly number[]
  /** the task ended (challenge, budget, done): only takeover and done work until a new task starts */
  readonly stopped?: string
}

export function newSession(now: number, limits: Partial<BudgetLimits> = {}): Session {
  return { budget: startBudget(now, limits), tainted: false, held: false, revision: 0, count: 0, allowed: [], seen: [], tabs: [] }
}

/** The task is over for this reason; the page text already read stays tainted. */
export const stop = (s: Session, why: string): Session => ({ ...s, stopped: why })

/** A new task: fresh budget and host count; taint, allowed hosts and tabs stay. */
export const resetTask = (s: Session, now: number, limits: Partial<BudgetLimits> = {}): Session => {
  const { stopped: _stopped, ...rest } = s
  void _stopped
  return { ...rest, budget: startBudget(now, limits), seen: [], held: false }
}

/** The shared partition of a project: the same sign-ins for every panel of that folder. */
export function projectPartition(root: string): string {
  let h = 5381
  for (const c of root) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0
  let g = 52711
  for (const c of root) g = ((g * 31) ^ c.charCodeAt(0)) >>> 0
  return `persist:browse-${h.toString(16)}${g.toString(16)}`.slice(0, 31)
}

export const taint = (s: Session): Session => (s.tainted ? s : { ...s, tainted: true })
export const hold = (s: Session, held: boolean): Session => ({ ...s, held })
export const withTabs = (s: Session, tabs: number[]): Session => ({ ...s, tabs })

export const actionContext = (s: Session): ActionContext => ({
  ...(s.revision > 0 ? { revision: s.revision, count: s.count } : {}),
  tabs: [...s.tabs],
})

/** A new element list: the revision moves on, the ids are kept to mark what is new next time. */
export function nextList(s: Session, ids: number[]): Session {
  return { ...s, revision: s.revision + 1, elementIds: ids, count: ids.length }
}

/** A navigation or an action that changes the page makes the last list stale. */
export const invalidate = (s: Session): Session => (s.revision === 0 ? s : { ...s, revision: s.revision + 1, count: 0 })

export type Spent = { session: Session; stop: BudgetReason | null; message?: string }

export function spendOne(s: Session, kind: SpendKind, now: number): Spent {
  const r = spend(s.budget, kind, now)
  const session = { ...s, budget: r.budget }
  return r.stop ? { session, stop: r.stop, message: `Task stopped. ${summarize(r.budget)} Tell the person what you did and what is left.` } : { session, stop: null }
}

export type Gate =
  | { kind: 'go'; host: string; newHost: boolean; rule?: string }
  | { kind: 'ask'; host: string; reason: string; alwaysOffered: boolean }
  | { kind: 'deny'; host?: string; reason: string }

const DENY: Record<string, string> = {
  invalid: 'that is not a web address',
  scheme: 'only http and https pages open',
  private: 'local and private addresses are not opened by the agent browser',
  rule: 'a policy rule refuses this host',
}

/** The gate for one main-frame URL: a first navigation, a link, a popup or a redirect hop. */
export function gateNavigation(s: Session, url: string, opts: Omit<HostOptions, 'allowed'>): Gate {
  const d = hostDecision(url, { ...opts, allowed: [...s.allowed] })
  if (d.decision === 'deny') return { kind: 'deny', host: d.host, reason: DENY[d.reason] ?? 'refused' }
  const newHost = !s.seen.includes(d.host)
  if (d.decision === 'allow') {
    return { kind: 'go', host: d.host, newHost, ...(d.rule ? { rule: d.rule } : {}) }
  }
  return { kind: 'ask', host: d.host, reason: d.reason, alwaysOffered: !s.tainted }
}

export type Answer = 'once' | 'always' | 'deny'
export type Admitted =
  | { ok: true; session: Session; host: string; writeRule?: string }
  | { ok: false; session: Session; message: string }

/** The person's answer to a host card. `always` is only honoured when the session is not tainted. */
export function admit(s: Session, host: string, answer: Answer, now: number): Admitted {
  if (answer === 'deny') return { ok: false, session: s, message: `The person did not allow ${host}. Do not retry; say so.` }
  const sp = s.seen.includes(host) ? ({ session: s, stop: null } as Spent) : spendOne(s, 'newHost', now)
  if (sp.stop) return { ok: false, session: sp.session, message: sp.message! }
  const session: Session = { ...sp.session, seen: sp.session.seen.includes(host) ? sp.session.seen : [...sp.session.seen, host], allowed: [...new Set([...sp.session.allowed, host])] }
  const always = answer === 'always' && !s.tainted
  return { ok: true, session, host, ...(always ? { writeRule: alwaysRule(host) } : {}) }
}

/** A rule allowed the host: count it as a new host once. */
export function admitByRule(s: Session, host: string, now: number): Admitted {
  if (s.seen.includes(host)) return { ok: true, session: s, host }
  const sp = spendOne(s, 'newHost', now)
  if (sp.stop) return { ok: false, session: sp.session, message: sp.message! }
  return { ok: true, session: { ...sp.session, seen: [...sp.session.seen, host] }, host }
}

export const MAX_TABS_PANEL = 3
export const MAX_VIEWS = 6
export const IDLE_MS = 10 * 60_000

/** Whether a panel with `own` tabs may open another one while `total` views exist app-wide. */
export function canOpenTab(own: number, total: number): string | null {
  if (own >= MAX_TABS_PANEL) return `at most ${MAX_TABS_PANEL} tabs per panel: close one with browser_tab_close`
  if (total >= MAX_VIEWS) return `at most ${MAX_VIEWS} browser views are open in the app: close a tab`
  return null
}

/** Which of the views (id -> last used) have been idle long enough to discard. */
export const idleViews = (used: Record<string, number>, now: number): string[] =>
  Object.entries(used).filter(([, at]) => now - at >= IDLE_MS).map(([k]) => k)

/** Page text as the model sees it: always fenced. Text that already carries the fence is returned as is. */
export function fence(text: string, url: string): string {
  let origin = 'unknown'
  try {
    origin = new URL(url).origin
  } catch {
    // keep unknown
  }
  return `<untrusted source="${origin}">\n${text.replace(/<\/?untrusted/gi, '&lt;untrusted')}\n</untrusted>`
}
