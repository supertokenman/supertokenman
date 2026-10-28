// The window's state, built from UI events by a pure reducer.
import type { UiEvent } from '../electron/session'
import type { FileEdit } from '../electron/diff'
import type { ShellEvent } from '../electron/shell'
import type { Exposure } from './bridge'
import { findDevUrls } from './preview'
import type { HudView } from '../../token-kit/mod/supertokenman/hooks/hud'

export type Line =
  | { kind: 'user'; text: string; images?: string[]; files?: string[] }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'note'; text: string; tone?: 'error' }
  | { kind: 'peer'; from: string; text: string }
  | { kind: 'shell'; id: string; command: string; out: string; code: number | null; ms: number; running: boolean }

export type Ask = { id: string; tool: string; summary: string; edit?: FileEdit; risk?: import('../shared/cmdrisk').Risk; why?: string; cls?: 'read' | 'write' }

export type State = {
  lines: Line[]
  streaming: string
  busy: boolean
  asks: Ask[]
  model: string
  cwd: string
  /** the role this panel was opened with */
  persona?: { id?: string; name: string; color: string; access?: 'read' | 'ask' | 'edit' }
  /** the panel's own git worktree, when it was opened in one */
  worktree?: import('./Worktree').PanelWorktree
  /** the OpenShell sandbox Claude Code runs in, when the panel was opened in one */
  sandbox?: string
  /** the machine Claude Code runs on, when it is not this one */
  remote?: { host: string; dir: string; branch?: string; repo?: string }
  /** the Claude Code session behind the panel, to resume it another day */
  sessionId?: string
  costUsd: number
  turns: number
  lastTurnAt: number | null
  /** the prompt cache's time to live, once a turn has told it */
  cacheTtl?: number
  context: { tokens: number; window: number; percent: number } | null
  limits: Record<string, { percentUsed: number; resetsAt?: string }>
  /** phase 96: the snapshot made before the last compact, until the next turn ends */
  snapshot?: { text: string; inject: boolean }
  /** phase 97: what the app's layers kept out of this panel's context, as a range */
  meter?: { label: string; detail: string[] }
  changes: FileEdit[]
  exposures: Exposure[]
  asleep: boolean
  /** main-thread turns, newest last: each re-reads what earlier ones left in context */
  turnTimes: number[]
  cuts: { tokens: number; at: number; cmd: string }[]
  ci: { repo: string; branch: string; runs: import('../electron/ci').Run[]; error?: string } | null
  ciDone: { conclusion: string | null; at: number; workflow: string }[]
  /** local URLs printed by commands still running: what the Preview tab shows */
  servers: { url: string; id: string; command: string }[]
  /** a message the budget is holding until the person lets it through */
  held?: { reason: string; scope: 'panel' | 'project' | 'persona' | 'turn' | 'task'; spent: number; limit: number; estimate: number } | null
  /** a turn stopped because it was going in circles */
  /** the loop guard paused the agent: what repeated, what it cost, the repeated steps */
  loop?: (Omit<Extract<UiEvent, { kind: 'loop' }>, 'kind'>) | null
  /** a trigger's step waiting for the person's go */
  gate?: { run: string; name: string; step: number; of: number; text: string } | null
  /** the panel's /goal, until a reply says it is met */
  goal?: string | null
}

export const initial: State = { lines: [], streaming: '', busy: false, asks: [], model: '', cwd: '', costUsd: 0, turns: 0, lastTurnAt: null, context: null, limits: {}, changes: [], exposures: [], asleep: false, turnTimes: [], cuts: [], ci: null, ciDone: [], servers: [] }

export type Action = UiEvent | ShellEvent | Exposure | { kind: 'note'; text: string; tone?: 'error' } | { kind: 'sent'; text: string; at: number; images?: string[]; files?: string[] } | { kind: 'answered'; id: string } | { kind: 'past'; turns: { prompt: string; reply: string }[]; note: string }

/** Output kept for the running command and for finished ones, in characters. */
const LIVE_RUN = 200_000
const OLD_RUN = 8_000

export function reduce(s: State, a: Action, now = Date.now()): State {
  switch (a.kind) {
    case 'ready':
      // in a sandbox Claude reports the folder inside it; the panel keeps the one on this machine
      return { ...s, model: a.model, cwd: s.sandbox ? s.cwd : a.cwd, sessionId: a.sessionId }
    case 'sent':
      return { ...s, busy: true, loop: null, lines: [...s.lines, { kind: 'user', text: a.text, ...(a.images?.length ? { images: a.images } : {}), ...(a.files?.length ? { files: a.files } : {}) }] }
    case 'delta':
      return { ...s, streaming: s.streaming + a.text }
    case 'assistant': {
      const lines: Line[] = [...s.lines]
      if (a.text) lines.push({ kind: 'assistant', text: a.text })
      for (const t of a.tools) lines.push({ kind: 'tool', name: t.name, summary: t.summary })
      return { ...s, streaming: '', lines }
    }
    case 'permission':
      return { ...s, asks: [...s.asks, { id: a.id, tool: a.tool, summary: a.summary, edit: a.edit, risk: a.risk, why: a.why, cls: a.cls }] }
    case 'shell-start':
      // finished runs keep only their tail, so a long session does not hold every output in memory
      return {
        ...s,
        lines: [
          ...s.lines.map((l) => (l.kind === 'shell' && !l.running && l.out.length > OLD_RUN ? { ...l, out: `... ${l.out.length - OLD_RUN} characters dropped\n${l.out.slice(-OLD_RUN)}` } : l)),
          { kind: 'shell', id: a.id, command: a.command, out: '', code: null, ms: 0, running: true },
        ],
      }
    case 'shell-out':
    case 'shell-end': {
      let servers = s.servers
      if (a.kind === 'shell-end') servers = servers.filter((v) => v.id !== a.id)
      else {
        const fresh = findDevUrls(a.text).filter((url) => !servers.some((v) => v.url === url))
        if (fresh.length) {
          const command = s.lines.find((l): l is Extract<Line, { kind: 'shell' }> => l.kind === 'shell' && l.id === a.id)?.command ?? ''
          servers = [...servers, ...fresh.map((url) => ({ url, id: a.id, command }))]
        }
      }
      return {
        ...s,
        servers,
        lines: s.lines.map((l) =>
          l.kind === 'shell' && l.id === a.id ? (a.kind === 'shell-out' ? { ...l, out: (l.out + a.text).slice(-LIVE_RUN) } : { ...l, running: false, code: a.code, ms: a.ms }) : l,
        ),
      }
    }
    case 'ci':
      return { ...s, ci: { repo: a.repo, branch: a.branch, runs: a.runs, error: a.error } }
    case 'ci-done':
      return { ...s, ciDone: [...s.ciDone, { conclusion: a.run.conclusion, at: a.at, workflow: a.run.workflow }].slice(-20) }
    case 'cut':
      return { ...s, cuts: [...s.cuts, { tokens: a.tokens, at: a.at, cmd: a.cmd }] }
    case 'unchanged':
      // counted in the savings ledger; nothing to show in the panel
      return s
    case 'sleep':
      return { ...s, asleep: true }
    case 'wake':
      return { ...s, asleep: false }
    case 'exposure':
      return { ...s, exposures: [...s.exposures, a] }
    case 'peer':
      return { ...s, busy: true, lines: [...s.lines, { kind: 'peer', from: a.from, text: a.text }] }
    case 'edit':
      return { ...s, changes: [...s.changes, a.edit] }
    case 'answered':
      return { ...s, asks: s.asks.filter((x) => x.id !== a.id) }
    case 'turn':
      return {
        ...s,
        busy: false,
        streaming: '',
        costUsd: a.costUsd,
        turns: s.turns + 1,
        lastTurnAt: now,
        cacheTtl: a.cacheTtlMs ?? s.cacheTtl,
        turnTimes: [...s.turnTimes, now].slice(-5000),
        lines: a.isError ? [...s.lines, { kind: 'note', text: a.text, tone: 'error' }] : s.lines,
      }
    case 'context':
      return { ...s, context: { tokens: a.tokens, window: a.window, percent: a.percent } }
    case 'meter':
      return { ...s, meter: { label: a.label, detail: a.detail } }
    case 'snapshot':
      return { ...s, snapshot: a.text ? { text: a.text, inject: a.inject } : undefined }
    case 'limits': {
      const limits = { ...s.limits }
      for (const w of a.windows) limits[w.kind] = { percentUsed: w.percentUsed, resetsAt: w.resetsAt }
      return { ...s, limits }
    }
    case 'preview-url':
      // a page the agent asked to show, approved in the panel
      return { ...s, servers: s.servers.some((v) => v.url === a.url) ? s.servers : [...s.servers, { url: a.url, id: 'stm', command: 'stm ask preview' }], lines: [...s.lines, { kind: 'note', text: `Preview ready: ${a.url} (Preview tab).` }] }
    case 'past':
      // a session opened at a past turn: the turns up to it, as they were, then where it picks up
      return { ...s, lines: [...a.turns.flatMap((t) => [{ kind: 'user' as const, text: t.prompt }, ...(t.reply ? [{ kind: 'assistant' as const, text: t.reply }] : [])]), { kind: 'note', text: a.note }, ...s.lines] }
    case 'note':
      return { ...s, lines: [...s.lines, { kind: 'note', text: a.text, tone: a.tone }] }
    case 'held':
      return { ...s, busy: false, held: { reason: a.reason, scope: a.scope, spent: a.spent, limit: a.limit, estimate: a.estimate } }
    case 'released':
      return { ...s, held: null }
    case 'loop': {
      // an empty reason clears the notice (Continue / don't pause again)
      const { kind: _k, ...l } = a
      return { ...s, loop: a.reason ? l : null }
    }
    case 'gate':
      return { ...s, gate: { run: a.run, name: a.name, step: a.step, of: a.of, text: a.text } }
    case 'gated':
      return { ...s, gate: null }
    case 'goal':
      return { ...s, goal: a.goal }
    case 'error':
      return { ...s, busy: false, lines: [...s.lines, { kind: 'note', text: a.message, tone: 'error' }] }
    default:
      // events the panel shows elsewhere (or not at all) leave the state as it is
      return s
  }
}

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')

// USD per million tokens (API list prices): input and cache read; a cache write is twice the input
const PRICES: [string, number, number][] = [
  ['fable', 10, 0.25],
  ['opus-5-5', 4, 0.2],
  ['opus', 5, 0.5],
  ['sonnet-5', 2, 0.2],
  ['sonnet', 3, 0.3],
  ['haiku-5-5', 0.1, 0.01],
  ['haiku', 1, 0.1],
]
const price = (model: string) => PRICES.find(([p]) => model.includes(p)) ?? ['', 4, 0.2]

/** What token-kit's cuts saved: each kept-out token is not written to the cache, nor re-read by every later turn. */
export function savedUsd(s: State) {
  const [, input, read] = price(s.model)
  return s.cuts.reduce((n, c) => n + (c.tokens * (input * 2 + read * s.turnTimes.filter((t) => t > c.at).length)) / 1e6, 0)
}

export const KO_MS = 4500

/** The HUD's view of the session: the same drawing as the SuperTokenMan mod. */
export function hudView(s: State, money: (usd: number) => string, now = Date.now(), portrait?: string): HudView {
  const lim = (key: string) => {
    const l = s.limits[key]
    return l ? { used: Math.max(0, Math.min(100, l.percentUsed)), resets: hhmm(l.resetsAt) } : null
  }
  return {
    ctxUsed: s.context ? Math.max(0, Math.min(100, s.context.percent)) : null,
    ctxTokens: k(s.context?.tokens ?? 0),
    ctxWindow: k(s.context?.window ?? 0),
    five: lim('five_hour'),
    seven: lim('seven_day'),
    cacheLeft: s.lastTurnAt == null ? null : Math.round((s.lastTurnAt + 3600000 - now) / 60000),
    round: s.turns,
    score: money(s.costUsd),
    saved: money(savedUsd(s)),
    kos: s.cuts.length,
    ko: (() => {
      const last = s.cuts.at(-1)
      if (!last || now - last.at > KO_MS) return null
      const [, input] = price(s.model)
      return { tokens: k(last.tokens), usd: money((last.tokens * input * 2) / 1e6) }
    })(),
    enemies: [],
    portrait,
  }
}

/** Every panel's state, by session id, in the order the panels were opened. */
export type Panels = { order: string[]; byId: Record<string, State>; focus: string | null }

export const noPanels: Panels = { order: [], byId: {}, focus: null }

export type PanelAction =
  | { kind: 'open'; sid: string; cwd: string; model: string; persona?: { id?: string; name: string; color: string; access?: 'read' | 'ask' | 'edit' }; sandbox?: string; remote?: { host: string; dir: string; branch?: string; repo?: string }; worktree?: import('./Worktree').PanelWorktree }
  | { kind: 'close'; sid: string }
  | { kind: 'focus'; sid: string }
  | { kind: 'event'; sid: string; action: Action }

export function reducePanels(p: Panels, a: PanelAction, now = Date.now()): Panels {
  switch (a.kind) {
    case 'open':
      return { order: [...p.order, a.sid], byId: { ...p.byId, [a.sid]: { ...initial, cwd: a.cwd, model: a.model, persona: a.persona, sandbox: a.sandbox, remote: a.remote, worktree: a.worktree } }, focus: a.sid }
    case 'close': {
      const order = p.order.filter((x) => x !== a.sid)
      const { [a.sid]: _gone, ...byId } = p.byId
      return { order, byId, focus: p.focus === a.sid ? (order.at(-1) ?? null) : p.focus }
    }
    case 'focus':
      return p.byId[a.sid] ? { ...p, focus: a.sid } : p
    case 'event': {
      const cur = p.byId[a.sid]
      // an event for a closed panel is dropped
      return cur ? { ...p, byId: { ...p.byId, [a.sid]: reduce(cur, a.action, now) } } : p
    }
  }
}
