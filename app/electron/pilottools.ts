// Pilot (spec-pilot.md): the panel agent runs app commands. Three generic tools (`app_commands`,
// `app_describe`, `app_run`) over the catalog in shared/pilotcatalog.ts, and read tools that return typed
// projections (never raw settings, never the vault). Tier, rate limit, audit and undo are enforced here and
// in electron/policy.ts (pilotGate); nothing the agent sends chooses a tier, and nothing here reads secrets.
import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { AuditLog } from './audit.js'
import { PILOT_RUN, pilotGate, type GateOpts, type Gated } from './policy.js'
import { COMMANDS, findCommand, validateArgs, type CommandSpec, type Tier } from '../shared/pilotcatalog.js'
import { publicSettings } from '../shared/pilotread.js'
import type { createPilotRate } from '../shared/pilotrate.js'
import { summarize } from '../shared/pilotsummary.js'
import { resolveTier, WIDENING_KEYS } from '../shared/pilottier.js'
import { UndoStack, type Action, type Inverse } from '../shared/pilotundo.js'

const PREFIX = 'mcp__stm__'
/** The tools that only read or describe: free, pre-approved in every panel. */
export const PILOT_READ_TOOLS = ['app_commands', 'app_describe', 'app_state', 'app_settings', 'app_cost', 'app_routines', 'app_packs', 'app_notifications'].map((n) => `${PREFIX}${n}`)
/** `app_run` is never pre-approved: every call goes through the app's permission step (see decideRun). */
export const PILOT_TOOLS = [...PILOT_READ_TOOLS, PILOT_RUN]

/** How long the window has to answer `pilot:run`. */
export const PILOT_TIMEOUT_MS = 10_000
/** An approval is used by the tool call that follows it; one that is not used soon is dropped. */
const GRANT_MS = 30_000

export type RunResult = { ok: boolean; text: string; undo?: Inverse | null; after?: unknown }
export type RunPayload = { callId: string; id: string; args: Record<string, unknown>; undo?: Inverse }

/** main -> window over `pilot:run`, and the window's `pilot:result` back; an error result after the timeout. */
export class PilotLink {
  private waits = new Map<string, (r: RunResult) => void>()
  private seq = 0
  constructor(
    private send: (payload: RunPayload) => boolean,
    private ms = PILOT_TIMEOUT_MS,
  ) {}

  call(p: Omit<RunPayload, 'callId'>): Promise<RunResult> {
    return new Promise((ok) => {
      const callId = `c${Date.now().toString(36)}${++this.seq}`
      const t = setTimeout(() => {
        this.waits.delete(callId)
        ok({ ok: false, text: `The window did not answer in ${Math.round(this.ms / 1000)} seconds. Nothing is known to have changed.` })
      }, this.ms)
      this.waits.set(callId, (r) => (clearTimeout(t), ok(r)))
      if (!this.send({ ...p, callId })) {
        clearTimeout(t)
        this.waits.delete(callId)
        ok({ ok: false, text: 'The app window is closed.' })
      }
    })
  }

  /** The window's answer. False when the call is unknown or already timed out. */
  settle(callId: string, r: RunResult): boolean {
    const w = this.waits.get(callId)
    if (!w) return false
    this.waits.delete(callId)
    w(r)
    return true
  }
}

export type Parsed = { ok: true; id: string; wire: string; spec: CommandSpec; args: Record<string, string | number | boolean>; tier: Tier } | { ok: false; error: string }

/**
 * The command the agent named, checked against the catalog. Ids that are not in it (policy files, tier
 * tables, anything unlisted) are refused here, as are commands the person must do (`agent: false`).
 */
export function parseRun(raw: { id?: unknown; args?: unknown }): Parsed {
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id || id.length > 1100) return { ok: false, error: 'id must be a command id from app_commands' }
  const literal = COMMANDS.find((s) => s.id === id)
  let spec: CommandSpec
  let fromId: Record<string, unknown> = {}
  if (literal) spec = literal
  else {
    const f = findCommand(id)
    if (!f) return { ok: false, error: `Unknown command "${id}". Call app_commands for the commands you may run.` }
    spec = f.spec
    fromId = f.args
  }
  if (!spec.agent) return { ok: false, error: `"${id}" needs the person (a picker, a file dialog or typing). Tell them to run it from Cmd+K.` }
  const given = raw.args === undefined ? {} : raw.args
  if (!given || typeof given !== 'object' || Array.isArray(given)) return { ok: false, error: 'args must be an object' }
  const merged: Record<string, unknown> = { ...(given as Record<string, unknown>) }
  for (const [k, v] of Object.entries(fromId)) {
    if (k in merged && merged[k] !== v) return { ok: false, error: `${k} is already part of the id "${id}"` }
    merged[k] = v
  }
  const c = validateArgs(spec, merged)
  if (!c.ok) return { ok: false, error: c.error }
  const wire = spec.id.replace(/<(\w+)>$/, (_m, k: string) => String(c.args[k]))
  return { ok: true, id, wire, spec, args: c.args, tier: resolveTier(spec, { args: c.args }) }
}

/** A stable text for one call, to match an approval to the call it was for. */
export const callKey = (id: string, args: Record<string, unknown>): string => JSON.stringify([id, Object.keys(args).sort().map((k) => [k, args[k]])])

/** The card text for a command that asks: title, args, tier, and the irreversible note. */
export function cardText(p: Extract<Parsed, { ok: true }>): string {
  const a = Object.entries(p.args).map(([k, v]) => `${k}=${String(v).slice(0, 80)}`).join(', ')
  return `Pilot: ${p.spec.title}${a ? ` (${a})` : ''} [${p.tier}]${p.spec.effect === 'irreversible' ? '. This cannot be undone.' : ''}`
}

export type Who = { sid: string; pilot: boolean; everywhere: boolean; tainted: boolean; project: string; turn: number }
export type Verdict = { action: 'allow' | 'ask' | 'deny'; gated: Gated; parsed?: Extract<Parsed, { ok: true }>; message?: string; card?: string }

/**
 * Per window: the rate limit, the undo stack, and the approvals the permission step gave. Created once by
 * main; the gate, rate limit and audit of every `app_run` go through `decide`.
 */
export class PilotHub {
  readonly undo = new UndoStack()
  private grants = new Map<string, number>()
  private seq = 0
  constructor(
    private rate: ReturnType<typeof createPilotRate>,
    private audit: Pick<AuditLog, 'pilot'>,
    private gateOpts: (sid: string) => GateOpts,
    private now: () => number = Date.now,
    private onChange: () => void = () => undefined,
  ) {}

  /**
   * The decision for one `app_run`: catalog check, tier, the policy gate (rules, taint, the Pilot or not),
   * then the rate limit. Writes the audit row. Over the limit the answer is a refusal with a text, not a card.
   */
  decide(input: { id?: unknown; args?: unknown }, who: Who): Verdict {
    const base = { panel: who.sid, project: who.project, turn: who.turn, tainted: who.tainted }
    const p = parseRun(input)
    if (!p.ok) {
      this.audit.pilot({ ...base, id: String(input.id ?? '').slice(0, 200), args: {}, decision: 'deny' })
      return { action: 'deny', gated: { action: 'deny', risk: null, by: 'pilot', reason: p.error }, message: p.error }
    }
    const g = pilotGate({ id: p.id, specId: p.spec.id, args: p.args, tier: p.tier, tainted: who.tainted, pilot: who.pilot, everywhere: who.everywhere }, this.gateOpts(who.sid))
    const log = (decision: 'allow' | 'ask' | 'deny') => this.audit.pilot({ ...base, id: p.id, args: p.args, tier: p.tier, decision, ...(g.rule ? { rule: g.rule } : {}) })
    if (g.action === 'deny') {
      log('deny')
      return { action: 'deny', gated: g, parsed: p, message: g.reason ?? 'Refused by the app.' }
    }
    const t = this.rate.take(who.sid, p.tier)
    if (!t.ok) {
      log('deny')
      return { action: 'deny', gated: { ...g, action: 'deny', reason: t.error }, parsed: p, message: t.error }
    }
    log(g.action)
    const card = cardText(p)
    if (g.action === 'allow') this.grant(who.sid, p)
    const why = g.why ?? `a Pilot command at the ${p.tier} tier${who.tainted && p.tier !== 'free' ? ', and this session read content the app does not trust' : ''}`
    return { action: g.action, gated: { ...g, why }, parsed: p, card }
  }

  /** The person (or an allow) approved this exact call; it may run once. */
  grant(sid: string, p: { id: string; args: Record<string, unknown> }): void {
    const t = this.now()
    for (const [k, at] of this.grants) if (t - at > GRANT_MS) this.grants.delete(k)
    this.grants.set(`${sid}:${callKey(p.id, p.args)}`, t)
  }
  /** Approval by the permission card: the input is the call as the agent sent it. */
  grantInput(sid: string, input: Record<string, unknown>): void {
    const p = parseRun(input)
    if (p.ok) this.grant(sid, p)
  }
  /** True once per grant. */
  take(sid: string, p: { id: string; args: Record<string, unknown> }): boolean {
    const k = `${sid}:${callKey(p.id, p.args)}`
    const at = this.grants.get(k)
    this.grants.delete(k)
    return at !== undefined && this.now() - at <= GRANT_MS
  }

  /** Records a finished command in the actions list. Returns the action. */
  record(p: Extract<Parsed, { ok: true }>, panel: string, r: RunResult): Action {
    // an undo that would restore a widening setting is not offered: the person turns that back on themselves
    const kindOk = r.undo && p.spec.undo && p.spec.undo !== 'none' && r.undo.kind === p.spec.undo && !(r.undo.kind === 'setting' && WIDENING_KEYS.includes(r.undo.key))
    const irreversible = p.spec.effect === 'irreversible'
    const prim = typeof r.after === 'string' || typeof r.after === 'number' || typeof r.after === 'boolean'
    const a: Action = { id: `a${++this.seq}`, at: this.now(), panel, command: p.wire, title: p.spec.title, undo: kindOk && !irreversible ? r.undo! : null, ...(irreversible ? { irreversible: true } : {}), ...(prim ? { after: r.after } : {}) }
    this.undo.push(a)
    this.onChange()
    return a
  }

  /** The layout change `ui_set_layout` made, recorded like any other free command. */
  recordLayout(panel: string, prev: string, next: string): void {
    this.undo.push({ id: `a${++this.seq}`, at: this.now(), panel, command: `layout-${next}`, title: 'Change the layout', undo: { kind: 'layout', prev }, after: next })
    this.onChange()
  }

  /** The actions list for the window, newest first. */
  actions(): ActionView[] {
    return this.undo.list().map((a) => ({ id: a.id, at: a.at, panel: a.panel, command: a.command, title: a.title, undo: a.undo ? a.undo.kind : null, irreversible: a.irreversible === true }))
  }

  /**
   * Undoes one action. It does not ask: restoring a recorded value is free. Refused only when the action
   * cannot be undone or the person changed the value since (`current` reads it again).
   */
  async runUndo(actionId: string, d: { current: (inv: Inverse) => Promise<unknown>; link: PilotLink }): Promise<{ ok: boolean; reason?: UndoReason }> {
    const a = this.undo.list().find((x) => x.id === actionId)
    if (!a) return { ok: false, reason: 'missing' }
    let now: unknown
    // a value main cannot read again (a window-only setting) skips the check instead of refusing
    if (a.undo && a.after !== undefined) now = (await d.current(a.undo).catch(() => undefined)) ?? a.after
    const plan = this.undo.plan(actionId, now)
    if (!plan.ok) return { ok: false, reason: plan.reason }
    const r = await d.link.call({ id: 'undo', args: {}, undo: plan.inverse })
    if (!r.ok) return { ok: false, reason: 'failed' }
    this.undo.take(actionId, now)
    this.onChange()
    return { ok: true }
  }

  /** Forgets a closed panel's rate bucket. */
  drop(sid: string): void {
    this.rate.drop(sid)
  }
}

export type UndoReason = 'missing' | 'irreversible' | 'none' | 'changed' | 'failed'
export type ActionView = { id: string; at: number; panel: string; command: string; title: string; undo: Inverse['kind'] | null; irreversible: boolean }

export type PilotDeps = {
  me: string
  hub: PilotHub
  link: PilotLink
  who: () => Who
  /** a card in the panel (Session.request): true only when the person allows */
  ask: (summary: string, why: string) => Promise<boolean>
  /** the typed projections; each returns text for the agent and never reads the vault */
  reads: {
    state: () => Promise<string>
    settings: () => { all: Record<string, unknown>; vaultBacked: string[] }
    cost: () => string
    routines: () => string
    packs: () => string
    notifications: (limit: number) => string
  }
  log: (msg: string) => void
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) })
const readOnly = { annotations: { readOnlyHint: true } }

/** What a panel may see in the catalog: everything runnable in the Pilot, free commands elsewhere (ask ones with pilotEverywhere). */
export function visibleTo(who: Pick<Who, 'pilot' | 'everywhere'>): CommandSpec[] {
  return COMMANDS.filter((c) => c.agent && (who.pilot || c.tier === 'free' || (who.everywhere && c.tier === 'ask')))
}

export function pilotTools(d: PilotDeps) {
  const fail = (m: string) => (d.log(`refused: ${m}`), text(m, true))
  return [
    tool(
      'app_commands',
      'The app commands you can run with app_run: id, title, tier (free runs, ask shows the person a card, confirm always asks) and the arguments. Optional group narrows the list. Call app_describe for one command before you run it.',
      { group: z.string().max(60).optional() },
      async ({ group }) => text(summarize(visibleTo(d.who()), { group }).text || 'No commands in that group.'),
      readOnly,
    ),
    tool(
      'app_describe',
      'One command in full: its arguments, tier, what undo does, and whether it cannot be undone. Describe before you run.',
      { id: z.string().min(1).max(200) },
      async ({ id }) => {
        const lit = COMMANDS.find((s) => s.id === id)
        const spec = lit ?? findCommand(id)?.spec
        if (!spec) return fail(`Unknown command "${id}".`)
        if (!spec.agent) return text(`${spec.id}: ${spec.title}. The person must run it (it needs a picker, a file dialog or typing).`)
        const args = Object.entries(spec.args).map(([k, a]) => `  ${k}: ${a.type === 'enum' ? (a.values ?? []).join('|') : a.type}${a.optional ? ' (optional)' : ''}${a.max !== undefined ? ` max ${a.max}` : ''} - ${a.describe}`)
        return text([`${spec.id}: ${spec.title}`, `Tier: ${spec.tier}${spec.tier === 'free' ? ' (runs now)' : spec.tier === 'ask' ? ' (the person sees a card)' : ' (always asks)'}`, `Undo: ${spec.effect === 'irreversible' ? 'cannot be undone' : spec.undo && spec.undo !== 'none' ? spec.undo : 'nothing to undo'}`, args.length ? `Arguments:\n${args.join('\n')}` : 'No arguments.'].join('\n'))
      },
      readOnly,
    ),
    tool(
      'app_run',
      'Run one app command from app_commands, as the person would from Cmd+K. Pass id and args as app_describe shows them. A free command runs at once; ask and confirm commands show the person a card first, and a tainted session (you read files, the web or shell output) always shows it. You are rate limited. Never ask the person for a secret to pass here.',
      { id: z.string().min(1).max(1100), args: z.record(z.string(), z.unknown()).optional() },
      async (a) => {
        const p = parseRun(a)
        if (!p.ok) {
          d.hub.decide(a, d.who())
          return fail(p.error)
        }
        // an approval from the permission step (the card, or a free command); without one this call did not
        // come through it (a settings file allowed the tool, or a test), so it is decided and asked here
        if (!d.hub.take(d.me, p)) {
          const v = d.hub.decide(a, d.who())
          if (v.action === 'deny') return fail(v.message ?? 'Refused by the app.')
          if (v.action === 'ask' && !(await d.ask(v.card ?? p.spec.title, v.gated.why ?? 'a Pilot command'))) return fail('The person did not allow it. Nothing was changed.')
          d.hub.take(d.me, p)
        }
        const r = await d.link.call({ id: p.wire, args: p.args })
        if (!r.ok) return fail(r.text || 'The command failed.')
        const act = d.hub.record(p, d.me, r)
        d.log(`${p.wire} ${act.id}`)
        return text(`${r.text || 'Done.'}${p.spec.effect === 'irreversible' ? ' This cannot be undone.' : act.undo ? ' The person can undo it from the actions list.' : ''}`)
      },
    ),
    tool('app_state', 'The window now: the layout and the open panels with their ids, folders and states.', {}, async () => text(await d.reads.state()), readOnly),
    tool(
      'app_settings',
      'Settings you may read: a short allowlist. Anything secret or kept in the vault is never returned, not even masked. keys narrows the list.',
      { keys: z.array(z.string().max(60)).max(20).optional() },
      async ({ keys }) => {
        const s = d.reads.settings()
        const r = publicSettings(s.all, { keys, vaultBacked: s.vaultBacked })
        const lines = Object.entries(r.values).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        return text([...lines, r.withheld.length ? `Not available: ${r.withheld.join(', ')}` : ''].filter(Boolean).join('\n') || 'No readable settings set.')
      },
      readOnly,
    ),
    tool('app_cost', 'Today\'s spend and each open panel\'s cost.', {}, async () => text(d.reads.cost()), readOnly),
    tool('app_routines', 'Routines and triggers: enabled state, next run and last run.', {}, async () => text(d.reads.routines()), readOnly),
    tool('app_packs', 'Installed and available packs.', {}, async () => text(d.reads.packs()), readOnly),
    tool('app_notifications', 'Recent notifications the app showed the person.', { limit: z.number().int().min(1).max(50).optional() }, async ({ limit }) => text(d.reads.notifications(limit ?? 20)), readOnly),
  ]
}
