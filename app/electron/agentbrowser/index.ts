// The agent browser as the main process uses it: the feature switch, the profile scope, the views, the
// guard and the runner wired together. Off by default; while off nothing is created: no view, no session,
// no tool, no request. The wiring in main.ts is a handful of calls into this object.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { AuditBy, AuditDecision } from '../../shared/auditlog.js'
import { projectPartition, type Answer } from '../../shared/browsersession.js'
import { createProfile, deleteProfile, effectiveScope, emptyProfiles, profilePartition, renameProfile, setDefault, setScope, type Edit, type Profiles } from '../../shared/browserprofiles.js'
import { randomUUID } from 'node:crypto'
import { DEFAULT_LIMITS, type BudgetLimits } from '../../shared/browserbudget.js'
import type { Ctx, ScopedRule } from '../../shared/policygate.js'
import { panelPartition } from '../../shared/panelbrowser.js'
import type { CacheRule } from '../../shared/leanfetch.js'
import { Guard, type Card } from './guard.js'
import { Runner } from './run.js'
import { browserTools } from './tools.js'
import { Views, type Rect } from './views.js'

export type Config = { enabled: boolean; screenshots: boolean; profiles: Profiles; limits: Partial<BudgetLimits> }
const DEFAULT: Config = { enabled: false, screenshots: false, profiles: emptyProfiles(), limits: {} }
const LIMIT_KEYS = ['steps', 'wallMs', 'screenshots', 'newHosts'] as const

export type AgentBrowserDeps = {
  /** the config file (userData/agentbrowser.json) */
  file: string
  win: () => BrowserWindow | null
  rules: (panel: string) => ScopedRule[]
  ctx: (panel: string) => Ctx
  /** the folder the panel works in; the project root for the shared profile */
  root: (panel: string) => string
  previewPanel: (panel: string) => boolean
  /** the system file dialog, opened in the panel's project folder; null when cancelled */
  pickFile: (panel: string) => Promise<string | null>
  writeRule: (panel: string, text: string) => void
  audit: (panel: string, row: { tool: string; args: string; decision: AuditDecision; by: AuditBy; rule?: string }) => void
  cacheRules: () => CacheRule[]
  /** main -> window: abrowser:state and abrowser:ask */
  push: (channel: 'abrowser:state' | 'abrowser:ask' | 'abrowser:enabled', payload: unknown) => void
  log: (m: string) => void
  now?: () => number
}

export function createAgentBrowser(d: AgentBrowserDeps) {
  const now = d.now ?? Date.now
  let cfg: Config = DEFAULT
  try {
    if (existsSync(d.file)) {
      const raw = JSON.parse(readFileSync(d.file, 'utf8')) as Partial<Config> & { scopes?: Record<string, string> }
      const p = raw.profiles ?? emptyProfiles()
      // 0.1.x wrote only the per-panel scope; it moves into the profiles block
      cfg = { ...DEFAULT, ...raw, profiles: { ...emptyProfiles(), ...p, scopes: { ...(raw.scopes ?? {}), ...(p.scopes ?? {}) } } }
      delete (cfg as Config & { scopes?: unknown }).scopes
    }
  } catch {
    cfg = DEFAULT
  }
  const save = () => {
    try {
      mkdirSync(dirname(d.file), { recursive: true })
      writeFileSync(`${d.file}.tmp`, JSON.stringify(cfg))
      renameSync(`${d.file}.tmp`, d.file)
    } catch {
      // kept in memory for this run
    }
  }
  const edit = <T,>(r: Edit<T>) => {
    if (r.ok) {
      cfg = { ...cfg, profiles: r.value as unknown as Profiles }
      save()
    }
    return r.ok ? { ok: true as const } : r
  }
  const limits = () => ({ ...DEFAULT_LIMITS, ...cfg.limits })
  const scopeOf = (panel: string) => effectiveScope(cfg.profiles, panel, d.root(panel))
  const partitionOf = (panel: string) => {
    const sc = scopeOf(panel)
    return sc === 'project' ? projectPartition(d.root(panel)) : sc.startsWith('profile:') ? profilePartition(sc.slice(8)) : panelPartition(panel)
  }

  const guard: Guard = new Guard({
    now,
    rules: d.rules,
    ctx: d.ctx,
    previewPanel: d.previewPanel,
    limits,
    ask: async (card: Card) => {
      d.push('abrowser:ask', { id: card.id, panel: card.panel, kind: card.kind, detail: card.detail })
      // nobody answering for two minutes is a no (an answer from the window resolves the card first)
      return new Promise<Answer>((resolve) => setTimeout(() => resolve('deny'), 120_000).unref())
    },
    writeRule: d.writeRule,
    audit: d.audit,
  })

  const state = (panel: string) => {
    const s = guard.session(panel)
    return {
      panel,
      tabs: views.list(panel).map((t) => ({ id: t.id, url: t.url, title: t.title, loading: t.loading })),
      active: views.activeId(panel) ?? null,
      held: s.held,
      reason: s.holdReason ?? '',
      stopped: s.stopped ?? '',
      scope: scopeOf(panel),
      step: s.budget.steps,
      budget: s.budget.limits,
    }
  }
  const changed = (panel: string) => {
    if (cfg.enabled) d.push('abrowser:state', state(panel))
  }

  const views: Views = new Views({
    win: d.win,
    partitionOf,
    gate: (panel, url) => guard.navigate(panel, url),
    popup: (panel, url) => {
      // a popup is a navigation like any other: gated, then a new tab if the caps allow
      void guard.navigate(panel, url).then((ok) => {
        if (!ok) return
        try {
          const tab = views.open(panel)
          void tab.view?.webContents.loadURL(url).catch(() => undefined)
        } catch (e) {
          d.log(`popup not opened: ${(e as Error).message}`)
        }
      })
    },
    download: (panel, info) => guard.download(panel, info),
    downloadDir: (panel) => join(d.root(panel), '.stm', 'downloads'),
    net: () => undefined,
    chooser: (panel) => guard.audit(panel, 'mcp__stm__browser_upload', { note: 'file chooser not opened' }, 'deny', 'app'),
    changed,
    now,
  })

  const runner = new Runner({ root: d.root, pickFile: d.pickFile, views, guard, enabled: () => cfg.enabled, screenshots: () => cfg.screenshots, cacheRules: d.cacheRules, now, changed })

  return {
    enabled: () => cfg.enabled,
    setEnabled(on: boolean) {
      cfg = { ...cfg, enabled: on }
      save()
      if (on) views.startSweeper()
      else views.closeAll()
      d.push('abrowser:enabled', on)
      d.log(`agent browser ${on ? 'on' : 'off'}`)
      return on
    },
    /** the tools of one panel; empty while the feature is off */
    tools: (panel: string) => (cfg.enabled ? browserTools(runner, panel, (m) => d.log(`${panel} ${m}`)) : []),
    bounds(panel: string, rect: Rect | null) {
      if (cfg.enabled) views.setBounds(panel, rect)
    },
    take(panel: string) {
      guard.update(panel, (s) => ({ ...s, held: true }))
      guard.audit(panel, 'mcp__stm__browser_takeover', { by: 'the person' }, 'pause', 'person')
      changed(panel)
    },
    release(panel: string) {
      guard.update(panel, (s) => ({ ...s, held: false }))
      changed(panel)
    },
    answer(id: string, answer: Answer) {
      return guard.answer(id, answer)
    },
    waiting: () => guard.waiting(),
    /** Chooses where a panel's sign-ins live: its own, the project's, or a named profile. */
    profile(panel: string, scope: string) {
      const r = edit(setScope(cfg.profiles, panel, scope))
      if (r.ok) {
        views.closePanel(panel)
        changed(panel)
      }
      return r.ok ? scope : scopeOf(panel)
    },
    profiles(panel?: string) {
      const root = panel ? d.root(panel) : ''
      return { list: cfg.profiles.list, scope: panel ? scopeOf(panel) : 'panel', default: root ? cfg.profiles.defaults[root] ?? null : null, project: root }
    },
    createProfile(name: unknown) {
      const r = createProfile(cfg.profiles, name, randomUUID())
      if (!r.ok) return r
      cfg = { ...cfg, profiles: r.value.profiles }
      save()
      return { ok: true as const, value: r.value.profile }
    },
    renameProfile: (id: string, name: unknown) => edit(renameProfile(cfg.profiles, id, name)),
    async deleteProfile(id: string) {
      const user = views.panels().filter((p) => scopeOf(p) === `profile:${id}`)
      const r = deleteProfile(cfg.profiles, id)
      if (!r.ok) return r
      for (const p of new Set([...user, ...r.value.panels])) {
        views.closePanel(p)
        changed(p)
      }
      cfg = { ...cfg, profiles: r.value.profiles }
      save()
      await views.clearPartition(profilePartition(id))
      return { ok: true as const, value: true }
    },
    setDefault: (panel: string, id: string | null) => edit(setDefault(cfg.profiles, d.root(panel), id)),
    settings: () => ({ enabled: cfg.enabled, screenshots: cfg.screenshots, limits: limits() }),
    setSettings(patch: { screenshots?: boolean; limits?: Partial<BudgetLimits> }) {
      const next: Partial<BudgetLimits> = { ...cfg.limits }
      for (const k of LIMIT_KEYS) {
        const v = patch.limits?.[k]
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) next[k] = Math.round(v)
      }
      cfg = { ...cfg, ...(typeof patch.screenshots === 'boolean' ? { screenshots: patch.screenshots } : {}), limits: next }
      save()
      return this.settings()
    },
    /** The person drives the pane while they hold the browser: address, back, forward, reload, tabs. */
    async nav(panel: string, op: 'go' | 'back' | 'forward' | 'reload' | 'stop', url?: string): Promise<string> {
      if (!cfg.enabled) return 'The agent browser is off.'
      if (!guard.session(panel).held) return 'Take over first: the assistant is driving.'
      let tab = views.get(panel)
      if (op === 'go') {
        const raw = (url ?? '').trim()
        if (!raw) return ''
        const full = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
        if (!/^https?:\/\//i.test(full)) return 'Only http and https addresses open here.'
        if (!(await guard.navigate(panel, full))) return guard.lastRefusal(panel) ?? 'That address did not open.'
        tab ??= views.open(panel)
        views.live(tab)
        await tab.view!.webContents.loadURL(full).catch(() => undefined)
        return ''
      }
      const wc = tab?.view?.webContents
      if (!wc) return ''
      const h = wc.navigationHistory
      if (op === 'back' && h.canGoBack()) h.goBack()
      else if (op === 'forward' && h.canGoForward()) h.goForward()
      else if (op === 'reload') wc.reload()
      else if (op === 'stop') wc.stop()
      return ''
    },
    tab(panel: string, op: 'switch' | 'close' | 'new', id?: number): string {
      if (!cfg.enabled) return ''
      if (op === 'switch' && id !== undefined) views.switchTo(panel, id)
      else if (op === 'close' && id !== undefined) views.close(panel, id)
      else if (op === 'new') {
        if (!guard.session(panel).held) return 'Take over first: the assistant is driving.'
        try {
          views.open(panel)
        } catch (e) {
          return (e as Error).message
        }
      }
      return ''
    },
    /** A still picture of the active page, shown in place of the view while something covers it. */
    async snap(panel: string): Promise<string | null> {
      if (!cfg.enabled) return null
      const wc = views.get(panel)?.view?.webContents
      if (!wc || wc.isDestroyed()) return null
      try {
        const img = await wc.capturePage()
        const w = img.getSize().width
        return (w > 1100 ? img.resize({ width: 1100 }) : img).toDataURL()
      } catch {
        return null
      }
    },
    clear: (panel: string) => views.clear(panel).then(() => changed(panel)),
    state,
    closePanel(panel: string) {
      views.closePanel(panel)
      guard.forget(panel)
      runner.forget(panel)
    },
    shutdown: () => views.closeAll(),
    get config() {
      return cfg
    },
  }
}

export type AgentBrowser = ReturnType<typeof createAgentBrowser>
