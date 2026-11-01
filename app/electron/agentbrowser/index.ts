// The agent browser as the main process uses it: the feature switch, the profile scope, the views, the
// guard and the runner wired together. Off by default; while off nothing is created: no view, no session,
// no tool, no request. The wiring in main.ts is a handful of calls into this object.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { AuditBy, AuditDecision } from '../../shared/auditlog.js'
import { projectPartition, type Answer } from '../../shared/browsersession.js'
import { DEFAULT_LIMITS, type BudgetLimits } from '../../shared/browserbudget.js'
import type { Ctx, ScopedRule } from '../../shared/policygate.js'
import { panelPartition } from '../../shared/panelbrowser.js'
import type { CacheRule } from '../../shared/leanfetch.js'
import { Guard, type Card } from './guard.js'
import { Runner } from './run.js'
import { browserTools } from './tools.js'
import { Views, type Rect } from './views.js'

export type Config = { enabled: boolean; screenshots: boolean; scopes: Record<string, 'panel' | 'project'>; limits: Partial<BudgetLimits> }
const DEFAULT: Config = { enabled: false, screenshots: false, scopes: {}, limits: {} }

export type AgentBrowserDeps = {
  /** the config file (userData/agentbrowser.json) */
  file: string
  win: () => BrowserWindow | null
  rules: (panel: string) => ScopedRule[]
  ctx: (panel: string) => Ctx
  /** the folder the panel works in; the project root for the shared profile */
  root: (panel: string) => string
  previewPanel: (panel: string) => boolean
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
    if (existsSync(d.file)) cfg = { ...DEFAULT, ...(JSON.parse(readFileSync(d.file, 'utf8')) as Partial<Config>) }
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
  const limits = () => ({ ...DEFAULT_LIMITS, ...cfg.limits })
  const partitionOf = (panel: string) => (cfg.scopes[panel] === 'project' ? projectPartition(d.root(panel)) : panelPartition(panel))

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

  const runner = new Runner({ views, guard, enabled: () => cfg.enabled, screenshots: () => cfg.screenshots, cacheRules: d.cacheRules, now, changed })

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
    profile(panel: string, scope: 'panel' | 'project') {
      cfg = { ...cfg, scopes: { ...cfg.scopes, [panel]: scope } }
      save()
      views.closePanel(panel)
      return scope
    },
    clear: (panel: string) => views.clear(panel),
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
