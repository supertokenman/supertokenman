// The policy gate in the main process: loads the rules files (global in userData, per project in .stm/policy.rules),
// recompiles them when a file changes, and puts a call through shared/policygate.ts after the app's own decide.
// It can only tighten what decide returned, except an explicit `allow` rule that turns an `ask` into `allow`.
// Anything that goes wrong here (a file that cannot be read, an exception in the evaluator) falls back to `ask`
// for what would have been allowed, and never to a looser answer.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditBy } from '../shared/auditlog.js'
import { AGENT_CAP, FANOUT_CAP, panelsStarted } from '../shared/planview.js'
import { evaluate, globRe, RANK, strictest, type Ctx, type Decision, type ScopedRule } from '../shared/policygate.js'
import { parseRules, type RuleError } from '../shared/policyrules.js'
import type { Risk } from '../shared/cmdrisk.js'
import type { Tier } from '../shared/pilotcatalog.js'
import { toDecision } from '../shared/pilottier.js'

export type Existing = { action: Decision; risk: Risk | null; reason?: string; why?: string; cls?: 'read' | 'write' }
export type Gated = Existing & { by: AuditBy; rule?: string; bp?: 'before' | 'afterPlan' }
export type Breakpoint = { kind: 'before' | 'afterPlan'; tool?: string }
export type Loaded = { text: string; errors: RuleError[]; rules: ScopedRule[]; unreadable?: string }

const EMPTY: Loaded = { text: '', errors: [], rules: [] }
const RECHECK_MS = 1000
/** where a panel may not quietly write: the rules files themselves */
const POLICY_FILE = /(^|\/)\.stm\/policy\.rules$|(^|\/)SuperTokenMan\/policy\/global\.rules$/
const POLICY_TEXT = /\.stm\/policy\.rules|policy\/global\.rules/

/** The rules of one file, re-read when its size or time changes (checked at most once a second). */
class FileRules {
  private cached: Loaded = EMPTY
  private sig = ''
  private checked = 0
  constructor(private scope: 'global' | 'project', private path: string) {}
  get(now: number): Loaded {
    if (now - this.checked < RECHECK_MS && this.sig) return this.cached
    this.checked = now
    let sig = 'none'
    try {
      const st = statSync(this.path)
      sig = `${st.mtimeMs}:${st.size}`
    } catch {
      // no file: no rules
    }
    if (sig === this.sig) return this.cached
    this.sig = sig
    if (sig === 'none') return (this.cached = EMPTY)
    try {
      const text = readFileSync(this.path, 'utf8')
      const r = parseRules(text)
      this.cached = { text, errors: r.errors, rules: r.rules.map((rule) => ({ scope: this.scope, rule })) }
    } catch (e) {
      this.cached = { ...EMPTY, unreadable: e instanceof Error ? e.message : String(e) }
    }
    return this.cached
  }
}

export class PolicyStore {
  private global: FileRules
  private projects = new Map<string, FileRules>()
  constructor(private globalFile: string) {
    this.global = new FileRules('global', globalFile)
  }
  get globalPath() {
    return this.globalFile
  }
  static projectPath(root: string) {
    return join(root, '.stm', 'policy.rules')
  }
  loadGlobal(now = Date.now()): Loaded {
    return this.global.get(now)
  }
  loadProject(root: string | undefined, now = Date.now()): Loaded {
    if (!root) return EMPTY
    let f = this.projects.get(root)
    if (!f) this.projects.set(root, (f = new FileRules('project', PolicyStore.projectPath(root))))
    return f.get(now)
  }
  rules(root: string | undefined, now = Date.now()): ScopedRule[] {
    return [...this.loadGlobal(now).rules, ...this.loadProject(root, now).rules]
  }
}

/** Per-panel control state: breakpoints, and the counts that the per-run caps read. Reset when a run starts. */
export class PanelControl {
  breakpoints: Breakpoint[] = []
  agents = 0
  fanout = 0
  planSeen = false
  afterPlanDone = false
  planLines: string[] = []
  agentCap = AGENT_CAP
  fanoutCap = FANOUT_CAP
  runStart() {
    this.agents = 0
    this.fanout = 0
    this.planSeen = false
    this.afterPlanDone = false
  }
}

const baseName = (n: string) => (n.includes('__') ? n.slice(n.lastIndexOf('__') + 2) : n)

export type GateOpts = {
  store: PolicyStore
  root: string | undefined
  ctx: Ctx
  control?: PanelControl
  unattended?: boolean
  now?: number
}

/** Tightens the app's own result with the rules, the per-run caps and the breakpoints. */
export function gate(tool: string, input: Record<string, unknown>, existing: Existing, o: GateOpts): Gated {
  // hard denies of the app are not policy; nothing past them runs
  if (existing.action === 'deny') return { ...existing, by: 'app' }
  let out: Gated = { ...existing, by: existing.risk ? 'app' : 'default' }
  try {
    const v = evaluate(o.store.rules(o.root, o.now), { tool, input }, o.ctx, existing.action)
    if (v.by === 'rule' && v.decision === 'deny') {
      out = { ...existing, action: 'deny', by: 'rule', rule: v.rule, reason: `Policy rule ${v.rule} refuses this. Say so to the person instead of retrying.` }
    } else if (v.by === 'rule') {
      out = { ...existing, action: v.decision, by: 'rule', rule: v.rule, ...(v.decision === 'ask' ? { why: `Policy rule ${v.rule}` } : {}) }
    }
  } catch {
    // the evaluator failed: what would have run without a card now asks
    out = { ...existing, action: strictest(existing.action, 'ask'), by: 'default', why: 'The policy rules could not be checked, so this asks.' }
  }
  if (out.action === 'deny') return out
  // a panel changing the rules files itself always asks, whatever the rules say
  const path = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  const writesPolicy = (path && POLICY_FILE.test(path.replace(/\\/g, '/'))) || (tool === 'Bash' && typeof input.command === 'string' && POLICY_TEXT.test(input.command))
  if (writesPolicy && (tool === 'Bash' || /^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool))) {
    out = { ...out, action: 'ask', by: 'app', why: 'This changes the policy rules.' }
  }
  const c = o.control
  if (!c) return out
  // per-run caps: the next agent or panel past the cap asks (it is not refused)
  const b = baseName(tool)
  if (b === 'Task' || b === 'Agent') {
    c.agents++
    if (c.agents > c.agentCap && out.action === 'allow') out = { ...out, action: 'ask', by: 'app', why: `This run already started ${c.agentCap} agents.` }
  } else {
    const n = panelsStarted(tool, input)
    if (n > 0) {
      const over = c.fanout + n > c.fanoutCap
      c.fanout += n
      if (over && out.action === 'allow') out = { ...out, action: 'ask', by: 'app', why: `This run already started ${c.fanoutCap} panels.` }
    }
  }
  // breakpoints come last and can only turn allow into ask
  let hit: { bp: 'before' | 'afterPlan'; label: string } | null = null
  if (tool === 'TodoWrite') c.planSeen = true
  else if (c.planSeen && !c.afterPlanDone && c.breakpoints.some((x) => x.kind === 'afterPlan')) {
    c.afterPlanDone = true
    hit = { bp: 'afterPlan', label: `Breakpoint: after the plan.${c.planLines.length ? ` Plan: ${c.planLines.join('; ')}` : ''}`.slice(0, 600) }
  }
  if (!hit) {
    const x = c.breakpoints.find((k) => k.kind === 'before' && k.tool && globRe(k.tool, false).test(tool))
    if (x) hit = { bp: 'before', label: `Breakpoint: before ${x.tool}` }
  }
  if (hit) {
    if (o.unattended) return { ...out, action: 'deny', by: 'app', bp: hit.bp, reason: `${hit.label}. This run has nobody to answer, so the call is refused. Say so instead of retrying.` }
    out = { ...out, action: strictest(out.action, 'ask'), by: out.action === 'allow' ? 'app' : out.by, why: hit.label, bp: hit.bp }
  }
  return out
}

export const PILOT_RUN = 'mcp__stm__app_run'

export type PilotCall = {
  /** the command id as the agent named it, and the catalog spec's own id when it differs (a family) */
  id: string
  specId: string
  args: Record<string, unknown>
  /** from the CommandSpec and the args, never from the agent (shared/pilottier.ts resolveTier) */
  tier: Tier
  /** the session has read untrusted content (electron/session.ts) */
  tainted: boolean
  /** the Pilot panel's session; any other panel runs only free commands, or ask ones with pilotEverywhere */
  pilot: boolean
  everywhere: boolean
}

/**
 * The gate for one `app_run`. The tier decides what the app says (shared/pilottier.ts toDecision); policy
 * rules then run on `mcp__stm__app_run` (with `arg.id`) and on `app_run:<id>`, and may tighten anything.
 * A rule `allow` loosens only an ask-tier command in a clean Pilot session: confirm never allows, a tainted
 * session never allows ask, and a panel that is not the Pilot always shows the card.
 */
export function pilotGate(c: PilotCall, o: GateOpts): Gated {
  const input = { id: c.id, args: c.args }
  if (!c.pilot && c.tier === 'confirm') return { action: 'deny', risk: null, by: 'pilot', reason: `"${c.id}" needs the person's confirmation and runs only in the Pilot panel. Say so instead of retrying.` }
  if (!c.pilot && c.tier === 'ask' && !c.everywhere) return { action: 'deny', risk: null, by: 'pilot', reason: `"${c.id}" is not free: this panel may run only free commands. The person can use the Pilot panel for it. Say so instead of retrying.` }
  const existing: Existing = { action: toDecision(c.tier, { tainted: c.tainted, ruleAllows: false }), risk: null }
  const names = [...new Set([`app_run:${c.id}`, `app_run:${c.specId}`])]
  const a = gate(PILOT_RUN, input, existing, o)
  if (a.action === 'deny') return { ...a, by: a.by === 'rule' ? 'rule' : 'pilot' }
  const others = names.map((n) => gate(n, input, existing, { ...o, control: undefined }))
  const ruled = [a, ...others].filter((g) => g.by === 'rule')
  const denied = ruled.find((g) => g.action === 'deny')
  if (denied) return denied
  // a breakpoint or a cap stops the call even where a rule allows it
  if (a.bp) return a
  const asked = ruled.find((g) => g.action === 'ask')
  if (asked) return { ...asked, action: strictest(existing.action, 'ask') }
  const allowed = ruled.find((g) => g.action === 'allow')
  if (!allowed) return a.action === 'allow' ? { ...a, by: 'pilot' } : { ...a, by: a.by === 'default' ? 'pilot' : a.by }
  // the only loosening: ask to allow, by a rule, in a clean Pilot session
  const final = toDecision(c.tier, { tainted: c.tainted, ruleAllows: c.pilot })
  if (final === 'allow') return { ...allowed, action: 'allow' }
  return { ...allowed, action: final, by: 'pilot', rule: allowed.rule, why: c.tainted && c.tier === 'ask' ? 'This session read content the app does not trust, so a rule cannot allow this on its own.' : c.tier === 'confirm' ? 'This always asks; no rule can allow it.' : 'Only the Pilot panel can run this without a card.' }
}

export { RANK }
