import type { Peripheral } from '../electron/peripherals'
import type { DbConn, DbResult, DbTable } from '../electron/db'
import type { ApiRequest, ApiResponse } from '../electron/apiclient'
import type { HeadroomStats } from '../electron/headroom'
import type { Source, Summary } from '../electron/ledger'
import type { Loaded, LocalModel, SmallStats } from '../electron/small'
import type { Job } from '../electron/local'
import type { Overhead } from '../electron/overhead'
import type { FeedItem } from '../electron/social/open'
import type { Folder, MailMessage, MailPage } from '../electron/mail/outlook'
import type { Account as MailAccount } from '../electron/mail/service'
import type { ElevenUsage, ElevenVoice } from '../electron/content/elevenlabs'
import type { StorageConfig } from '../electron/content/storage'
import type { Piece } from '../electron/content/pieces'
import type { Comment, NetworkId, Post, Profile } from '../electron/social/core'
import type { Item as QueueItem } from '../electron/social/queue'
export type SocialStatus = { id: NetworkId; name: string; can: { read: boolean; comments: boolean; reply: boolean; publish: boolean; note?: string }; connected: boolean; oauth: boolean; redirect?: string; steps: { label: string; url: string }[] }
import type { Trigger } from '../shared/triggers'
import type { Persona } from '../shared/personas'
import type { LockPrefs } from '../electron/lock'
// What the preload exposes on window.stm, typed for the renderer.
import type { UiEvent } from '../electron/session'
import type { ShellEvent } from '../electron/shell'

export type { UiEvent }
export type PanelLinkView = { panel: string; auto: boolean; name: string; spent: { usd: number; tokens: number; turns: number }; capUsd: number | null }

type Up = { ratio: number | null; avgMs: number | null; count: number }
export type MonitorRow = { monitor: import('../shared/monitors').Monitor; state: import('../shared/monitors').State; beats: import('../shared/monitors').Beat[]; day: Up; month: Up; last: import('../shared/monitors').Beat | null }
export type HealthRow = { name: string; kind: string; target: string; last: { at: number; ok: boolean; ms: number; error?: string; tokens: number; count: number; version?: string } | null; approvedAt: number | null; change: import('../shared/mcphealth').Change | null; held: string[] }
export type InspConn = { label: string; ms: number; server: { name: string; version: string } | null; instructions: string | null; tools: (import('../shared/mcpinspect').Tool & { cls: 'read' | 'write'; flags: string[] })[]; tokens: number; resources: { uri: string; name?: string; description?: string; mimeType?: string }[]; prompts: { name: string; description?: string; arguments?: { name: string; required?: boolean; description?: string }[] }[] }
export type LeakScan = { at: number; source: 'git' | 'filesystem'; verified: boolean; leaks: import('../shared/leaks').Leak[]; ms: number }
export type SecScan = { at: number; kind: import('../shared/trivy').Kind; target: string; findings: import('../shared/trivy').Finding[]; ms: number }
export type WbState = { prompts: import('../shared/workbench').Prompt[]; filters: Record<string, import('../shared/workbench').Filter[]>; catalogCount: number; catalogAt: number | null; filterNames: Record<string, string> }
export type Experiment = { at: number; datasetId: string; variants: import('../electron/observe').Variant[]; results: import('../shared/spans').RunResult[]; summary: ReturnType<typeof import('../shared/spans').compare> }
export type SecretInfo = { name: string; savedAt: number; forCommands: boolean }
export type IntegrationInfo = {
  id: string
  name: string
  what: string
  tag: string
  repo?: string
  group: string
  auth: { kind: 'token'; secret: string; hint: string; createAt: string } | { kind: 'oauth' } | { kind: 'none' } | { kind: 'cli'; cli: 'aws' | 'gcloud' | 'az' | 'railway' }
  guard?: string
  commandSecret?: { secret: string; hint: string; createAt: string }
  steps?: { label: string; url: string }[]
  enabled: boolean
  ready: boolean
  engine?: 'web'
  engineReady?: boolean
}
export type { Item as CatalogItem } from '../electron/catalog'
export type MemoryInfo = {
  vault: string
  project: string
  notes: { file: string; title: string; date: string; excerpt: string }[]
  sessions: { id: string; title: string; firstPrompt: string; at: number; branch: string }[]
}
type G = typeof import('../electron/git')
export type GitBridge = {
  (op: 'status', sid: string): Promise<Awaited<ReturnType<G['status']>>>
  (op: 'diff', sid: string, path: string, staged: boolean, untracked: boolean): Promise<string>
  (op: 'stage' | 'unstage', sid: string, paths: string[]): Promise<string>
  (op: 'commit' | 'checkout', sid: string, value: string): Promise<string>
  (op: 'branches', sid: string): Promise<Awaited<ReturnType<G['branches']>>>
  (op: 'pull' | 'push' | 'suggest', sid: string): Promise<string>
  (op: 'log', sid: string): Promise<ReturnType<G['lanes']>>
}
export type Exposure = { kind: 'exposure'; name: string; secretKind: string; where: string; at: number }

export type Bridge = {
  personas: {
    list: () => Promise<Persona[]>
    save: (p: Persona) => Promise<Persona[]>
    remove: (id: string) => Promise<Persona[]>
    exportFile: (id: string, dir?: string | null) => Promise<string | null>
    importFiles: (paths?: string[]) => Promise<Persona[]>
    history: (id: string) => Promise<import('../shared/versions').Version[]>
    restore: (id: string, at: number) => Promise<Persona[]>
  }
  triggers: {
    list: () => Promise<Trigger[]>
    save: (t: Trigger) => Promise<Trigger[]>
    remove: (id: string) => Promise<Trigger[]>
    run: (id: string) => Promise<void>
    webhook: (id: string) => Promise<{ curl: string; listening: boolean } | null>
    runs: () => Promise<import('../shared/runs').Run[]>
    begin: (sid: string, t: { id: string; name: string; prompt: string; gate?: boolean }, resume?: string) => Promise<void>
    gate: (run: string, ok: boolean) => Promise<void>
    onFire: (cb: (t: { id: string; name: string; persona: string; cwd: string; prompt: string; gate?: boolean }) => void) => () => void
  }
  storage: {
    get: () => Promise<{ config: StorageConfig | null; hasKeys: boolean; providers: Record<string, { name: string; needs: string[]; hint: string; keysAt: string }> }>
    set: (config: Partial<StorageConfig>, keys?: { accessKeyId: string; secretAccessKey: string }) => Promise<{ config: StorageConfig; hasKeys: boolean }>
    test: () => Promise<{ url: string; publicOk: boolean }>
    upload: (path: string) => Promise<string>
  }
  hotkey: {
    get: () => Promise<{ accel: string; active: boolean }>
    set: (accel: string) => Promise<{ accel: string; active: boolean }>
  }
  palette: {
    dismissed: () => Promise<void>
    used: () => Promise<void>
    onSummon: (cb: () => void) => () => void
  }
  mail: {
    status: () => Promise<{ accounts: Record<MailAccount, { connected: boolean; account: { name: string; address: string } | null }>; redirect: string; googleRedirect: string; folders: { id: Folder; name: string }[] }>
    connect: (acct: MailAccount, clientId: string, clientSecret?: string) => Promise<{ name: string; address: string }>
    disconnect: (acct: MailAccount) => Promise<void>
    list: (acct: MailAccount, folder: Folder, search?: string, next?: string) => Promise<MailPage>
    unread: (acct: MailAccount) => Promise<number>
    get: (acct: MailAccount, id: string) => Promise<MailMessage>
    markRead: (acct: MailAccount, id: string, read: boolean) => Promise<void>
    move: (acct: MailAccount, id: string, to: Folder) => Promise<void>
    reply: (acct: MailAccount, id: string, text: string, all: boolean) => Promise<void>
    send: (acct: MailAccount, m: { to: string; cc?: string; subject: string; text: string }) => Promise<void>
  }
  voice: {
    get: () => Promise<{ connected: boolean; voices?: ElevenVoice[]; usage?: ElevenUsage; error?: string }>
    connect: (key: string) => Promise<boolean>
    disconnect: () => Promise<boolean>
  }
  content: {
    list: (project?: string) => Promise<Piece[]>
    engine: (project: string) => Promise<{ id: string; label: string; ready: boolean; note: string }>
    install: (which?: 'video' | 'voice') => Promise<void>
    voiceReady: () => Promise<boolean>
    pickMusic: (id: string, paths?: string[]) => Promise<Piece | null>
    create: (p: Partial<Piece>) => Promise<Piece>
    update: (id: string, patch: Partial<Piece>) => Promise<Piece>
    remove: (id: string) => Promise<Piece[]>
    script: (id: string) => Promise<string>
    tag: (sid: string, id: string) => Promise<void>
    render: (id: string) => Promise<Piece>
    check: (id: string) => Promise<Piece>
    reveal: (path: string) => Promise<void>
    onLog: (cb: (id: string, line: string) => void) => () => void
    onChanged: (cb: () => void) => () => void
  }
  social: {
    status: () => Promise<SocialStatus[]>
    connectToken: (n: NetworkId, token: string) => Promise<Profile>
    connectOAuth: (n: NetworkId, clientId: string, clientSecret?: string) => Promise<Profile>
    disconnect: (n: NetworkId) => Promise<void>
    profile: (n: NetworkId) => Promise<Profile>
    timeline: (n: NetworkId) => Promise<FeedItem[]>
    like: (n: NetworkId, id: string) => Promise<void>
    repost: (n: NetworkId, id: string) => Promise<void>
    posts: (n: NetworkId) => Promise<Post[]>
    comments: (n: NetworkId, postId: string) => Promise<Comment[]>
    reply: (n: NetworkId, commentId: string, text: string, postId?: string) => Promise<void>
    suggest: (comment: string, post: string) => Promise<string>
    queue: () => Promise<QueueItem[]>
    save: (item: Partial<QueueItem>) => Promise<QueueItem[]>
    approve: (id: string, on: boolean) => Promise<QueueItem[]>
    retry: (id: string) => Promise<QueueItem[]>
    remove: (id: string) => Promise<QueueItem[]>
    move: (id: string, when: number | null) => Promise<QueueItem[]>
    comment: (id: string, text: string) => Promise<QueueItem[]>
    slots: () => Promise<import('../shared/pubcal').Slot[]>
    setSlots: (s: import('../shared/pubcal').Slot[]) => Promise<import('../shared/pubcal').Slot[]>
    connected: () => Promise<NetworkId[]>
  }
  routerAsk: (text: string, localOnly?: boolean) => Promise<{ id: string | null; where: 'local' | 'claude' | 'none' }>
  savings: { get: (days: number) => Promise<{ summary: Summary; sources: { id: Source; name: string; what: string; method: 'measured' | 'from the tool' | 'estimated' }[] }> }
  overhead: { panels: () => Promise<{ sid: string; cwd: string; model: string }[]>; get: (sid: string) => Promise<(Overhead & { warmUsd: number; coldUsd: number }) | null> }
  lean: { get: () => Promise<{ on: boolean; off: string[]; saves: number }>; set: (on: boolean) => Promise<boolean> }
  connectIntegration: (id: string) => Promise<'connected' | 'failed'>
  cli: { status: (cli: 'aws' | 'gcloud' | 'az' | 'railway') => Promise<(import('../electron/clilogin').CliStatus & { runner?: string }) | null>; login: (cli: 'aws' | 'gcloud' | 'az' | 'railway') => Promise<{ started: boolean; hint?: string }> }
  local: {
    status: () => Promise<{ installed: boolean; version: string | null; models: LocalModel[] | null; model: string | null; loaded: Loaded[] | null; jobs: Job[]; stats: SmallStats }>
    start: () => Promise<boolean>
    test: () => Promise<{ ok: true; text: string; ms: number; tokens: number; perSec: number } | { ok: false; error: string; ms?: number }>
    chat: (id: string, messages: { role: 'system' | 'user' | 'assistant'; content: string }[], kind: 'chat' | 'explain' | 'shrink') => Promise<{ tokens?: number; model?: string; error?: string; stopped?: boolean }>
    stop: (id: string) => Promise<void>
    suggested: () => Promise<{ name: string; job: string; size: string }[]>
    pull: (name: string) => Promise<{ ok?: true; error?: string }>
    onDelta: (fn: (id: string, text: string) => void) => () => void
    onPull: (fn: (p: { name: string; status: string; done: number }) => void) => () => void
  }
  onBrowseNet: (fn: (v: { wc: number; method: string; url: string; status?: number; error?: string; at: number }) => void) => () => void
  onPanelFocus: (fn: (sid: string) => void) => () => void
  devices: {
    get: () => Promise<Peripheral[] | null>
    on: (fn: (list: Peripheral[] | null) => void) => () => void
  }
  db: {
    list: () => Promise<{ conns: DbConn[]; secrets: string[] }>
    save: (c: DbConn) => Promise<DbConn[]>
    delete: (id: string) => Promise<DbConn[]>
    tables: (id: string) => Promise<DbTable[] | { error: string }>
    query: (id: string, sql: string) => Promise<DbResult>
    schema: (id: string) => Promise<import('../electron/db').DbSchema>
    explain: (id: string, sql: string) => Promise<import('../electron/db').PlanNode[]>
    history: (id: string) => Promise<{ sql: string; at: number; ok: boolean; ms: number }[]>
    exportRows: (id: string, sql: string, format: 'csv' | 'json', dir?: string | null) => Promise<{ file: string; rows: number; cut: boolean } | null>
    ask: (id: string, request: string) => Promise<string>
    apply: (id: string, statements: string[]) => Promise<{ ok: true; changed: number; ms: number } | { ok: false; error: string; at: number }>
  }
  api: {
    list: () => Promise<{ requests: ApiRequest[]; history: { at: number; method: string; url: string; status: number; ms: number }[]; secrets: string[] }>
    save: (r: ApiRequest) => Promise<ApiRequest[]>
    delete: (id: string) => Promise<ApiRequest[]>
    send: (r: ApiRequest) => Promise<ApiResponse>
  }
  term: {
    open: (sid: string, cols: number, rows: number) => Promise<{ shell: string; cwd: string; headroom?: boolean } | false>
    write: (sid: string, data: string) => void
    resize: (sid: string, cols: number, rows: number) => void
    close: (sid: string) => Promise<void>
    targets: (scope: 'local' | 'cloud') => Promise<{ targets: { kind: 'docker' | 'ssh' | 'cloud'; name: string; detail: string; command: string }[]; missing: string[] }>
    connect: (sid: string, command: string) => Promise<boolean>
    history: (cwd: string, query?: string) => Promise<import('../shared/termhist').HistItem[]>
    remember: (cwd: string, cmd: string) => Promise<import('../shared/termhist').HistItem[]>
    suggest: (sid: string, request: string) => Promise<{ cmd: string; risk: import('../shared/cmdrisk').Risk }>
    type: (sid: string, cmd: string, run: boolean, confirmed?: boolean) => Promise<{ ok: boolean; risk?: import('../shared/cmdrisk').Risk }>
    onData: (fn: (sid: string, data: string) => void) => () => void
    onExit: (fn: (sid: string, code: number) => void) => () => void
    onProc: (fn: (sid: string, name: string) => void) => () => void
  }
  link: { open: (url: string) => Promise<boolean> }
  mini: { open: (url: string, seconds: number) => Promise<boolean>; onClosed: (fn: (v: { id: string; seconds: number }) => void) => () => void }
  symbols: { get: () => Promise<{ on: boolean; installed: boolean }>; set: (on: boolean) => Promise<boolean>; install: () => Promise<void> }
  headroom: {
    get: () => Promise<{ on: boolean; shorter: boolean; installed: boolean; live: boolean; stats: HeadroomStats | null }>
    set: (on: boolean) => Promise<{ live: boolean }>
    shorter: (on: boolean) => Promise<{ live: boolean }>
    install: () => Promise<void>
    quality: () => Promise<{ on: boolean; rows: import('../electron/hrquality').Quality[] }>
    inspect: (on: boolean) => Promise<boolean>
  }
  small: {
    get: () => Promise<{ model: string | null; models: LocalModel[] | null; stats: SmallStats; loaded: Loaded[] | null; jobs: Job[] }>
    set: (model: string | null) => Promise<string | null>
  }
  newSession: (opts?: { cwd?: string; remote?: { host: string; dir: string; worktree?: boolean }; model?: string; resume?: string; resumeAt?: string; persona?: string; effort?: string; sandbox?: boolean; worktree?: { label: string; group?: string; attempt?: number; of?: number } }) => Promise<{ sid: string; cwd: string; missing: { id: string; secret: string }[]; persona?: { name: string; color: string; model: string }; sandbox?: string; remote?: { host: string; dir: string; branch?: string }; worktree?: import('./Worktree').PanelWorktree }>
  sandbox: {
    status: () => Promise<{ installed: boolean; version?: string; gateway: boolean; detail?: string }>
    prepare: (cwd: string) => Promise<string>
    onLog: (cb: (line: string) => void) => () => void
    changes: (cwd: string) => Promise<{ path: string; kind: 'added' | 'changed' | 'deleted' }[]>
    apply: (cwd: string, paths: string[]) => Promise<number>
    remove: (cwd: string) => Promise<boolean>
  }
  vaultList: () => Promise<SecretInfo[]>
  vaultSet: (name: string, value: string, forCommands?: boolean) => Promise<void>
  vaultDelete: (name: string) => Promise<void>
  vaultForCommands: (name: string, on: boolean) => Promise<void>
  integrations: () => Promise<IntegrationInfo[]>
  integrationStars: (fetchNow?: boolean) => Promise<Record<string, number>>
  web: { install: () => Promise<void>; onLog: (cb: (line: string) => void) => () => void }
  setIntegration: (id: string, on: boolean) => Promise<void>
  openUrl: (url: string) => Promise<void>
  exportText: (name: string, text: string, dir?: string | null) => Promise<string | null>
  setPanelModel: (sid: string, model: string) => Promise<boolean>
  routeTally: () => Promise<import('../shared/arena').Tally>
  faithJudge: (pairs: { claim: string; passages: string }[]) => Promise<{ verdicts: ('supported' | 'partial' | 'unsupported' | null)[]; costUsd: number }>
  onClosing?: (fn: () => void) => void
  /** The window's right-click menu: the main process sends the rows, the app draws them and answers with the row chosen. */
  ctx?: { onOpen: (fn: (m: { x: number; y: number; items: { label?: string; enabled?: boolean; sep?: boolean }[] }) => void) => () => void; pick: (i: number) => void }
  closeReady: () => void
  /** which of these folders exist */
  existing: (paths: string[]) => Promise<string[]>
  backtest: {
    saveScript: (cwd: string, kind: string, text: string) => Promise<string>
  }
  photos: {
    get: () => Promise<{ dir: string; immich: string; immichKey: boolean }>
    pick: (chosen?: string | null) => Promise<string>
    scan: () => Promise<import('../shared/photos').Photo[]>
    thumb: (source: 'folder' | 'immich', id: string) => Promise<string>
    open: (id: string) => Promise<string | void>
    immichSet: (url: string, key: string) => Promise<boolean>
    immich: (q: string) => Promise<import('../shared/photos').Photo[]>
  }
  vmeta: {
    fetch: (urls: string[]) => Promise<{ videos: import('../shared/videometa').VideoMeta[]; failed: { id: string; error: string }[] }>
    exportTo: (cwd: string, rel: string, list: import('../shared/videometa').VideoMeta[]) => Promise<{ file: string; count: number; added: number }>
  }
  book: {
    get: () => Promise<Booking | null>
    save: (b: Omit<Booking, 'url' | 'publishedAt'>) => Promise<Booking>
    preview: () => Promise<import('../shared/slots').Slot[]>
    publish: () => Promise<{ url: string; slots: number }>
    requests: () => Promise<BookingRequest[]>
    decide: (id: string, status: 'accepted' | 'declined') => Promise<BookingRequest>
  }
  learn: {
    cards: () => Promise<import('../shared/learn').Card[]>
    save: (cards: import('../shared/learn').Card[]) => Promise<import('../shared/learn').Card[]>
    plan: (cwd: string, slug: string) => Promise<string>
  }
  selfhost: {
    deploy: (host: string, id: string, hostPort: number, publicBind: boolean) => Promise<{ ok: boolean; text: string; where: string }>
  }
  adr: {
    list: (cwd: string) => Promise<{ dir: string; adrs: import('../shared/archdesk').Adr[] }>
    read: (cwd: string, file: string) => Promise<string>
    save: (cwd: string, file: string, text: string) => Promise<import('../shared/archdesk').Adr[]>
    create: (cwd: string, title: string, context: string, supersedes?: number) => Promise<{ file: string; adrs: import('../shared/archdesk').Adr[] }>
    status: (cwd: string, file: string, status: import('../shared/archdesk').AdrStatus) => Promise<import('../shared/archdesk').Adr[]>
  }
  localVoice: {
    get: () => Promise<{ ready: boolean; voice: string }>
    hear: (audio: Uint8Array, lang: string) => Promise<{ text: string; lang: string }>
    speak: (text: string, voice?: string) => Promise<string>
    pick: (voice: string) => Promise<string>
  }
  mi: {
    list: (project: string, mode: 'now' | 'history') => Promise<import('../shared/memitems').MemItem[]>
    add: (project: string, text: string, origin: import('../shared/memitems').Origin) => Promise<number>
    edit: (id: string, text: string) => Promise<number>
    archive: (id: string, on: boolean) => Promise<number>
    chain: (id: string) => Promise<import('../shared/memitems').MemItem[]>
    search: (project: string, q: string, mode: 'now' | 'history', origin?: import('../shared/memitems').Origin[]) => Promise<import('../shared/memitems').Hit[]>
    onChanged: (fn: () => void) => () => void
  }
  compactor: {
    get: () => Promise<import('../shared/compact').Stage[]>
    set: (stages: import('../shared/compact').Stage[]) => Promise<boolean>
    saved: (sid: string, tokens: number) => Promise<boolean>
  }
  xray: {
    images: () => Promise<{ name: string; size: string }[]>
    run: (image: string) => Promise<import('../electron/imagexray').Report>
  }
  forge: {
    get: () => Promise<{ kind: 'github' | 'gitea'; url: string; hasToken: boolean }>
    set: (kind: 'github' | 'gitea', url: string) => Promise<{ kind: 'github' | 'gitea'; url: string; hasToken: boolean }>
  }
  act: {
    jobs: (cwd: string) => Promise<{ jobs: import('../shared/act').Job[]; secrets: string[] }>
    run: (cwd: string, job: import('../shared/act').Job, secrets: string[]) => Promise<number | null>
    stop: () => Promise<boolean>
    onLine: (fn: (line: string) => void) => () => void
  }
  radar: {
    get: () => Promise<RadarCfg>
    save: (groups: string, weights: Record<string, number>, ntfy: string) => Promise<RadarCfg>
    run: (onlyNew: boolean, hours: number) => Promise<{ hits: import('../shared/radar').Hit[]; sources: string[]; lastAt: number }>
    mark: () => Promise<RadarCfg>
    draft: (hits: import('../shared/radar').Hit[]) => Promise<{ text: string; by: string }>
    notify: (text: string) => Promise<boolean>
  }
  bitwarden: {
    status: () => Promise<BwState>
    unlock: (password: string) => Promise<BwState>
    lock: () => Promise<BwState>
    search: (q: string) => Promise<{ id: string; name: string; fields: string[] }[]>
    link: (name: string, item: string, field: string, label: string) => Promise<BwState>
    unlink: (name: string) => Promise<BwState>
  }
  shortTerm: {
    get: (sid: string) => Promise<{ on: boolean; items: { at: number; id: string; tool: string; what: string; kind: import('../shared/symbolic').OutKind; chars: number; savedTokens: number; file: string }[] }>
    set: (sid: string, on: boolean) => Promise<boolean>
    original: (sid: string, id: string) => Promise<{ text: string; file: string }>
  }
  projGraph: {
    build: (cwd: string) => Promise<import('../shared/projgraph').Graph & { built: number; files: number }>
    get: (cwd: string) => Promise<import('../shared/projgraph').Graph & { built: number }>
    focus: (cwd: string, id: string) => Promise<{ dependents: import('../electron/graphstore').Dependent[]; touching: import('../shared/projgraph').GNode[] }>
    ask: (cwd: string, text: string) => Promise<string | null>
  }
  reflect: {
    list: () => Promise<{ pending: { id: string; project: string; at: number; turns: number; size: number }[]; local: string | null; vault: boolean }>
    draft: (id: string) => Promise<{ items: { item: import('../shared/reflect').Item; clashes: import('../shared/reflect').Clash[] }[]; via: 'local' | 'haiku'; costUsd: number; project: string }>
    keep: (id: string, picks: { item: import('../shared/reflect').Item; replace: boolean }[]) => Promise<number>
    dismiss: (id: string) => Promise<boolean>
    onPending: (fn: (n: number) => void) => () => void
  }
  diagCheck: {
    get: (sid: string) => Promise<{ cwd: string; check: string | null; on: boolean; runs: { at: number; ms: number; before: number; after: number; fresh: import('../shared/diagcheck').Diag[]; note: string }[] }>
    set: (sid: string, on: boolean) => Promise<boolean>
  }
  live: {
    connect: (id: string, r: import('../electron/realtime').LiveReq) => Promise<{ ok: true } | { error: string }>
    send: (id: string, text: string, event?: string) => Promise<boolean>
    close: (id: string) => Promise<void>
    saved: () => Promise<import('../electron/realtime').Saved[]>
    save: (x: import('../electron/realtime').Saved) => Promise<import('../electron/realtime').Saved[]>
    remove: (id: string) => Promise<import('../electron/realtime').Saved[]>
    onEntry: (fn: (id: string, e: import('../electron/realtime').Entry | { closed: true }) => void) => () => void
  }
  stacks: {
    list: () => Promise<{ stacks: import('../shared/stacks').Stack[]; docker: boolean }>
    open: (name: string) => Promise<{ stack: import('../shared/stacks').Stack; services: import('../shared/stacks').Service[]; files: { path: string; text: string; mtime: number }[] }>
    save: (name: string, file: string, text: string, mtime: number) => Promise<{ ok: boolean; error?: string; mtime?: number }>
    act: (name: string, act: import('../shared/stacks').Act) => Promise<{ ok: boolean; out: string }>
    logs: (name: string | null, service?: string) => Promise<boolean>
    onLog: (fn: (lines: string[]) => void) => () => void
  }
  appContainers: {
    list: () => Promise<{ rows: import('../shared/containers').Row[]; use: Record<string, import('../shared/containers').Use>; docker: boolean }>
    watch: (on: boolean) => Promise<boolean>
    act: (id: string, act: 'stop' | 'rm') => Promise<boolean>
    onEvent: (fn: (ev: import('../shared/containers').Ev) => void) => () => void
  }
  anomalySeries: (sid: string) => Promise<{ key: string; samples: import('../shared/anomaly').Sample[]; bands: Record<'cost' | 'tokens' | 'seconds', { median: number; low: number; high: number }> }>
  pdfTools: {
    config: (url?: string) => Promise<{ url: string; hasKey: boolean; ops: { id: import('../electron/stirling').Op; name: string; many: boolean }[] }>
    pick: (chosen?: string[]) => Promise<{ file: string; bytes: number }[]>
    scan: (file: string) => Promise<{ i: number; kind: string; shown: string }[]>
    run: (op: import('../electron/stirling').Op, files: string[], p: { pages?: string; level?: number; languages?: string[]; pick?: number[] }) => Promise<{ file: string; bytes: number }>
    reveal: (file: string) => Promise<void>
  }
  vaultBoard: {
    notes: () => Promise<{ vault: string; notes: import('../shared/fmviews').Note[] }>
    set: (file: string, key: string, value: string, mtime: number) => Promise<number>
    importEnex: (chosen?: string[]) => Promise<{ notes: number; files: number; folder: string } | null>
  }
  handoff: {
    write: (cwd: string, text: string, replace: boolean) => Promise<{ file: string; exists: boolean; written?: boolean }>
    pickHtml: (chosen?: string[]) => Promise<{ file: string; html: string } | null>
  }
  mdImages: {
    pick: (chosen?: string[]) => Promise<string | null>
    scan: (file: string) => Promise<{ file: string; storage: boolean; images: (import('../shared/mdimages').LocalImage & { abs: string; bytes: number; preview: string | null })[] }>
    publish: (file: string, refs: string[], template: import('../shared/mdimages').Template) => Promise<{ published: { ref: string; url: string }[]; errors: { ref: string; error: string }[]; changed: number }>
  }
  gatewayLog: () => Promise<import('../electron/gateway').LogLine[]>
  office: {
    status: () => Promise<{ found: import('../electron/office').Found; built: { file: string; rel: string; ok: boolean; error?: string; hash?: string; issues: string[]; valid: boolean | null; png: boolean; commands: number; ms: number; at: number; panel: string }[] }>
    preview: (file: string) => Promise<string | null>
    reveal: (file: string) => Promise<void>
  }
  snap: {
    set: (sid: string, text: string, inject: boolean) => Promise<boolean>
  }
  billSource: {
    get: (sid: string) => Promise<QuotaState>
    set: (sid: string, to: import('../shared/quotapolicy').Source, confirms: number) => Promise<QuotaState>
    resume: (sid: string) => Promise<QuotaState>
    custom: (on: boolean, url: string) => Promise<boolean>
  }
  prune: {
    suggest: (sid: string, task: string) => Promise<{ total: number; keep: string[]; off: string[]; tokens: number; failed: string[]; pruned: number }>
    apply: (sid: string, off: string[]) => Promise<number>
    reset: (sid: string) => Promise<number>
  }
  deeplink: {
    pending: () => Promise<import('../shared/deeplink').Link | { error: string } | null>
    on: (fn: (l: import('../shared/deeplink').Link | { error: string }) => void) => () => void
  }
  onMenu: (fn: (id: string) => void) => () => void
  diag: {
    get: () => Promise<{ recent: import('../electron/errlog').LogEntry[]; dir: string; crashes: string }>
    report: () => Promise<string>
    open: () => Promise<string>
    selftest: () => Promise<never>
    renderer: (text: string) => void
  }
  rt: {
    state: () => Promise<{ routines: import('../shared/routines').Routine[]; drafts: import('../shared/routines').Draft[]; busy: string[] }>
    save: (r: Partial<import('../shared/routines').Routine>) => Promise<unknown>
    remove: (id: string) => Promise<unknown>
    run: (id: string) => Promise<boolean>
    read: (id: string, read: boolean) => Promise<unknown>
    dropDraft: (id: string) => Promise<unknown>
    onChanged: (fn: () => void) => () => void
  }
  iso: {
    status: (sid: string) => Promise<{ on: boolean; image: string; network: boolean; name?: string }>
    start: (sid: string, image: string) => Promise<{ on: boolean; image: string; network: boolean; name?: string }>
    stop: (sid: string) => Promise<{ on: boolean }>
    network: (sid: string, on: boolean) => Promise<{ on: boolean; image: string; network: boolean; name?: string }>
  }
  wt: {
    list: () => Promise<import('../shared/worktasks').WorkTask[]>
    create: (title: string, goal: string, budgetUsd: number, sid?: string) => Promise<import('../shared/worktasks').WorkTask>
    link: (id: string, sid: string, on: boolean) => Promise<import('../shared/worktasks').WorkTask>
    budget: (id: string, usd: number) => Promise<import('../shared/worktasks').WorkTask>
    decide: (id: string, decision: string) => Promise<import('../shared/worktasks').WorkTask>
    onChanged: (fn: () => void) => () => void
  }
  pb: {
    list: (cwd: string) => Promise<({ file: string; playbook: import('../shared/playbook').Playbook; error?: undefined } | { file: string; error: string; playbook?: undefined })[]>
    create: (cwd: string) => Promise<string>
    runs: (sid?: string) => Promise<import('../shared/playbook').PbRun[]>
    run: (sid: string, file: string, resume?: string) => Promise<import('../shared/playbook').PbRun>
    stop: (id: string) => Promise<boolean>
    onChanged: (fn: () => void) => () => void
  }
  msgf: {
    list: () => Promise<import('../shared/msgfilters').MsgFilter[]>
    save: (f: Partial<import('../shared/msgfilters').MsgFilter> & { code: string }) => Promise<import('../shared/msgfilters').MsgFilter[]>
    remove: (id: string) => Promise<import('../shared/msgfilters').MsgFilter[]>
    test: (code: string, stage: 'inlet' | 'outlet', text: string, valves: Record<string, unknown>) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
  }
  extract: {
    run: (text: string, fields: import('../shared/extract').FieldSpec[], examples: string, project: string) => Promise<{ items: import('../shared/extract').Extracted[]; costUsd: number }>
    stop: () => Promise<boolean>
    onProgress: (fn: (p: { done: number; of: number }) => void) => () => void
  }
  phone: {
    get: () => Promise<{ on: boolean; url: string | null; phones: { name: string; at: number }[]; send: boolean; port: number }>
    start: () => Promise<unknown>
    stop: () => Promise<unknown>
    code: () => Promise<{ code: string; until: number }>
    forget: () => Promise<boolean>
    setSend: (on: boolean) => Promise<boolean>
  }
  mcpsrv: {
    get: () => Promise<{ send: boolean; stm: string }>
    setSend: (on: boolean) => Promise<boolean>
  }
  bmap: {
    scan: (cwd: string) => Promise<{ map: import('../shared/backendmap').BackendMap; gateway?: import('../shared/kong').Gateway; markdown: string; cut: boolean }>
    save: (cwd: string, markdown: string, replace: boolean) => Promise<{ written: boolean; file: string }>
  }
  askData: {
    run: (id: string, sql: string) => Promise<import('../electron/db').DbResult>
    board: () => Promise<import('../shared/askdata').BoardItem[]>
    keep: (item: Omit<import('../shared/askdata').BoardItem, 'id' | 'at'> & { id?: string }) => Promise<import('../shared/askdata').BoardItem[]>
    drop: (id: string) => Promise<import('../shared/askdata').BoardItem[]>
  }
  rc: {
    get: () => Promise<{ config: import('../electron/rocketchat').RcConfig | null; connected: boolean }>
    connect: (url: string, userId: string, token: string) => Promise<{ username: string; name: string }>
    disconnect: () => Promise<void>
    alerts: (room: string, alerts: { turns?: boolean; ci?: boolean }) => Promise<import('../electron/rocketchat').RcConfig>
    test: () => Promise<boolean>
  }
  remote: {
    hosts: () => Promise<string[]>
    check: (host: string, dir: string) => Promise<{ claude: string | null; git: string | null; dir: boolean; repo: boolean }>
    forward: (sid: string, port: number) => Promise<{ url: string; local: number }>
    worktree: (sid: string, act: 'merge' | 'drop') => Promise<string>
  }
  issue: {
    list: (cwd: string) => Promise<{ repo: string; issues: { number: number; title: string; labels: string[]; author: string; comments: number; updated: string; assignee: string | null }[] }>
    get: (repo: string, n: number) => Promise<{ issue: import('../shared/issuespec').Issue; slug: string; flags: import('../shared/injection').InjectionFinding[] }>
    spec: (worktree: string, repo: string, issue: import('../shared/issuespec').Issue) => Promise<{ path: string; prompt: string }>
  }
  sdraft: {
    list: () => Promise<SkillDraftRow[]>
    save: (row: Omit<SkillDraftRow, 'id' | 'at'> & { id?: string; at?: number }) => Promise<SkillDraftRow>
    discard: (id: string) => Promise<SkillDraftRow[]>
    import: (url: string, cwd: string) => Promise<SkillDraftRow>
    factory: (cwd: string) => Promise<number>
    existing: (cwd: string, name: string, scope: 'project' | 'personal') => Promise<string | null>
    approve: (id: string, draft: import('../shared/skilldraft').SkillDraft, scope: 'project' | 'personal', replace: boolean, acknowledged?: number) => Promise<{ written: true; file: string } | { written: false; exists: string }>
  }
  past: {
    search: (q: string, cwd?: string, mode?: 'words' | 'meaning' | 'both') => Promise<{ files: number; turns: number; read: number; mode: 'words' | 'meaning' | 'both'; vec: { done: number; total: number } | null; note?: string; hits: (import('../electron/pastsearch').PastHit & { score?: number; by?: ('words' | 'meaning')[] })[] }>
    index: () => Promise<{ done: number; total: number; added: number }>
    around: (file: string, n: number, before?: number) => Promise<import('../shared/pastsearch').PastTurn[]>
  }
  setupOpen: (url: string) => Promise<void>
  git: GitBridge
  setScheme: (scheme: 'light' | 'dark' | 'system') => Promise<void>
  publishDraft: (sid: string | null, brief: string, networks: string[]) => Promise<string>
  lock: {
    get: () => Promise<{ prefs: LockPrefs; available: boolean; touchId: boolean; secretsOpen: boolean }>
    set: (prefs: LockPrefs) => Promise<LockPrefs>
    prompt: (reason: string, method?: 'auto' | 'password') => Promise<boolean>
    onLock: (cb: () => void) => () => void
  }
  openAtLogin: (on?: boolean) => Promise<boolean>
  cloud: {
    scan: () => Promise<import('../electron/cloud').ProviderResult[]>
    repoSecrets: () => Promise<import('../electron/cloud').RepoSecrets[]>
  }
  env: {
    scan: () => Promise<import('../electron/envScan').EnvFile[]>
    toVault: (path: string, name: string, as: string) => Promise<string>
    ignore: (path: string) => Promise<void>
    reveal: (path: string) => Promise<void>
  }
  account: (sid: string) => Promise<{ email?: string; organization?: string; subscriptionType?: string; tokenSource?: string; apiKeySource?: string; apiProvider?: string }>
  updateCheck: (auto?: boolean) => Promise<{ behind: number; source: string | null; subjects?: string[] }>
  updateAuto: (on?: boolean) => Promise<boolean>
  /** Has the person answered the update question (updateCheck set to true or false)? */
  updateAsked: () => Promise<boolean>
  claudeUsageData: (on?: boolean) => Promise<boolean>
  updateRun: () => Promise<string>
  onUpdateProgress: (cb: (m: { state: 'busy' | 'down'; step: string; pct?: number; tail?: string }) => void) => () => void
  health: () => Promise<import('../electron/health').Part[]>
  sleepPanel: (sid: string) => Promise<boolean>
  searchSymbols: (q: string) => Promise<import('../shared/symbols').Sym[]>
  predictions: (filter: string) => Promise<import('../electron/markets').Prediction[]>
  quotes: (symbols: string[]) => Promise<{ quotes: import('../electron/markets').Quote[]; errors: { symbol: string; error: string }[] }>
  calendar: {
    list: () => Promise<string[]>
    add: (name: string, url: string) => Promise<void>
    remove: (name: string) => Promise<void>
    events: (fromIso: string, toIso: string) => Promise<{ events: import('../electron/calendar').Event[]; errors: { calendar: string; error: string }[] }>
  }
  news: {
    feeds: () => Promise<import('../electron/news').Feed[]>
    fetch: () => Promise<{ items: import('../shared/feeds').FeedItem[]; errors: { feed: string; error: string }[]; hidden: number }>
    add: (input: string) => Promise<import('../electron/news').Feed[]>
    suggested: () => Promise<import('../electron/news').Feed[]>
    remove: (url: string) => Promise<import('../electron/news').Feed[]>
    rsshub: (url: string) => Promise<string>
    discover: (input: string) => Promise<import('../shared/rsshub').Found[]>
    subscribe: (f: { url: string; title: string }) => Promise<import('../electron/news').Feed[]>
    read: (url: string) => Promise<{ title: string; paragraphs: string[]; image?: string }>
    setup: () => Promise<{ rsshub: string; rules: import('../shared/feeds').FeedRule[]; senders: string[]; briefing: import('../shared/feeds').Schedule; model: string; briefings: string[] }>
    rules: (r: import('../shared/feeds').FeedRule[]) => Promise<void>
    senders: (l: string[]) => Promise<string[]>
    newsletter: (id: string) => Promise<{ title: string; paragraphs: string[] }>
    opmlImport: (chosen?: string[]) => Promise<{ added: number; skipped: number } | null>
    opmlExport: (dir?: string | null) => Promise<{ file: string; count: number } | null>
    digest: (items: import('../shared/feeds').FeedItem[], save: boolean) => Promise<{ text: string; used: number; file: string }>
    briefing: (name: string) => Promise<string>
    schedule: (s: import('../shared/feeds').Schedule) => Promise<void>
  }
  billing: {
    all: () => Promise<import('../electron/billing').Source[]>
    fixed: () => Promise<import('../electron/billing').Fixed[]>
    setFixed: (f: import('../electron/billing').Fixed[]) => Promise<import('../electron/billing').Fixed[]>
  }
  naming: {
    check: (name: string) => Promise<import('../electron/naming').Check[]>
    links: (name: string) => Promise<{ trademarks: { label: string; url: string }[]; handles: { label: string; url: string }[] }>
    research: (idea: string, name: string) => Promise<import('../electron/naming').Research>
  }
  pr: {
    inbox: () => Promise<import('../electron/prs').Inbox>
    detail: (repo: string, n: number) => Promise<import('../electron/prs').PrDetail>
    comment: (repo: string, n: number, body: string) => Promise<void>
    review: (repo: string, n: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string) => Promise<void>
    merge: (repo: string, n: number, method: 'merge' | 'squash' | 'rebase') => Promise<void>
    checkout: (sid: string, repo: string, n: number) => Promise<string>
  }
  docker: {
    containers: () => Promise<import('../electron/docker').Container[]>
    images: () => Promise<import('../electron/docker').Image[]>
    volumes: () => Promise<import('../electron/docker').Volume[]>
    act: (op: import('../electron/docker').Op, id: string, confirmed?: boolean) => Promise<void>
    logs: (id: string) => Promise<string>
    exec: (id: string, command: string, confirmed?: boolean) => Promise<{ out: string; code: number }>
    removeImage: (id: string, confirmed?: boolean) => Promise<void>
    removeVolume: (name: string, confirmed?: boolean) => Promise<void>
    hosts: () => Promise<{ hosts: import('../shared/dockerhosts').Host[]; selected: string; writable: Record<string, boolean> }>
    setHost: (name: string) => Promise<string>
    setWritable: (name: string, on: boolean) => Promise<Record<string, boolean>>
  }
  ports: () => Promise<import('../electron/procs').Listener[]>
  killProcess: (pid: number, force: boolean) => Promise<void>
  ciRefresh: (sid: string) => Promise<void>
  ciJobs: (sid: string, runId: number) => Promise<import('../electron/ci').Job[]>
  ciLog: (sid: string, jobId: number) => Promise<string>
  ciRerun: (sid: string, runId: number) => Promise<void>
  ciCancel: (sid: string, runId: number) => Promise<void>
  spotifyNow: () => Promise<import('../electron/spotify').NowPlaying | null>
  spotifyCmd: (c: import('../electron/spotify').Command) => Promise<void>
  spotifySaved: () => Promise<import('../electron/spotify').Saved[]>
  spotifyAdd: (link: string) => Promise<import('../electron/spotify').Saved[]>
  spotifyRemove: (uri: string) => Promise<import('../electron/spotify').Saved[]>
  timeGet: () => Promise<import('./focusRound').TimeLog>
  timeSet: (log: import('./focusRound').TimeLog) => Promise<void>
  memoryInfo: (cwd: string) => Promise<MemoryInfo>
  memorySearch: (cwd: string, q: string) => Promise<{ file: string; line: number; text: string }[]>
  memoryGraph: () => Promise<{ nodes: import('../electron/memory').GraphNode[]; edges: import('../electron/memory').GraphEdge[] }>
  memoryDoc: (kind: 'note' | 'claude', cwd: string) => Promise<{ path: string; text: string; exists: boolean }>
  memorySaveDoc: (kind: 'note' | 'claude', cwd: string, text: string) => Promise<string>
  memoryRead: (file: string) => Promise<string>
  remember: (cwd: string, title: string, text: string) => Promise<string>
  catalogLocal: (cwd: string, fresh?: boolean) => Promise<import('../electron/catalog').Item[]>
  catalogReadme: (url: string) => Promise<{ repo: string; markdown: string } | null>
  catalogSearch: (q: string) => Promise<{ items: import('../electron/catalog').Item[]; errors: string[] }>
  installPlugin: (id: string) => Promise<void>
  uninstallPlugin: (id: string) => Promise<void>
  addMarketplace: (repo: string) => Promise<void>
  addMcp: (c: { id: string; name: string; remote?: string; npm?: string }) => Promise<void>
  closeSession: (sid: string) => Promise<void>
  pickFolder: () => Promise<string | null>
  /** git repositories under the home folder, for the in-app folder picker */
  findRepos: () => Promise<{ home: string; repos: string[] }>
  setPrivate: (on: boolean) => Promise<boolean>
  runShell: (sid: string, command: string) => Promise<string | null>
  stopShell: (sid: string, id: string) => Promise<void>
  send: (sid: string, text: string, attachments?: import('../shared/attach').Attachment[], why?: string) => Promise<void | { held: true }>
  release: (sid: string) => Promise<void>
  countTokens: (text: string, model?: string) => Promise<{ tokens: number; exact: boolean }>
  worktree: {
    stat: (sid: string) => Promise<{ files: number; added: number; removed: number; list: { path: string; added: number; removed: number }[] } | null>
    merge: (sid: string, message: string) => Promise<{ merged: boolean; why?: string }>
    drop: (sid: string) => Promise<boolean>
    keep: (sid: string, message: string) => Promise<{ merged: boolean; why?: string; closed: string[] }>
    test: (sid: string) => Promise<import('../shared/fanout').TestRun>
  }
  trace: (sid: string) => Promise<{ parts: import('../shared/trace').ContextPart[]; turns: import('../shared/trace').TraceTurn[] }>
  addRule: (scope: 'persona' | 'project', target: string, rule: string) => Promise<{ where: string }>
  arena: {
    run: (prompt: string) => Promise<{ kind: import('../shared/arena').Kind; local: { text: string; ms: number; model?: string } | { error: string }; claude: { text: string; ms: number; costUsd: number } | { error: string } }>
    vote: (kind: import('../shared/arena').Kind, w: import('../shared/arena').Winner) => Promise<import('../shared/arena').Tally>
    get: () => Promise<{ tally: import('../shared/arena').Tally; choices: import('../shared/arena').Choice[]; model: string | null }>
    reset: (kind: import('../shared/arena').Kind) => Promise<import('../shared/arena').Tally>
  }
  evals: {
    get: (id: string) => Promise<string>
    set: (id: string, text: string) => Promise<void>
    run: (id: string, where: 'local' | 'claude', instructions?: string) => Promise<import('../shared/evals').EvalResult[]>
    rewrite: (id: string, failures: string[]) => Promise<string>
  }
  styles: { get: () => Promise<import('../shared/styles').StyleId[]>; set: (ids: import('../shared/styles').StyleId[]) => Promise<import('../shared/styles').StyleId[]> }
  bands: () => Promise<import('../shared/bands').Band[]>
  receipts: () => Promise<{ count: number; brokenAt: number | null; signed: boolean }>
  a2m: {
    list: (q: string, cat: string, keyless: boolean) => Promise<{ count: number; categories: string[]; rows: import('../shared/api2mcp').ApiRow[] }>
    refresh: () => Promise<number>
    spec: (url: string) => Promise<{ base: string; ops: import('../shared/api2mcp').Op[] }>
    preview: (g: import('../shared/api2mcp').Gen) => Promise<{ path: string; content: string }[]>
    write: (project: string, g: import('../shared/api2mcp').Gen, overwrite: boolean) => Promise<{ written: string[]; clash: string[]; folder: string }>
    npm: (project: string, name: string) => Promise<string>
    install: (project: string, name: string, env: string | null, value: string, scope: 'user' | 'project') => Promise<{ name: string; file: string }>
  }
  mhealth: {
    get: (cwd: string) => Promise<HealthRow[]>
    check: (cwd: string, name?: string) => Promise<HealthRow[]>
    approve: (cwd: string, name: string) => Promise<HealthRow[]>
  }
  mpol: {
    get: (cwd: string) => Promise<{ policy: import('../shared/mcppolicy').Policy; servers: string[]; personas: { id: string; name: string }[] }>
    set: (p: import('../shared/mcppolicy').Policy) => Promise<import('../shared/mcppolicy').Policy>
  }
  insp: {
    servers: (cwd: string) => Promise<{ name: string; kind: string; target: string }[]>
    connect: (t: { name?: string; command?: string; args?: string[]; url?: string; type?: 'http' | 'sse' }, cwd: string) => Promise<InspConn>
    appDoc: (html: string) => Promise<string>
    call: (name: string, args: Record<string, unknown>, confirmed: boolean) => Promise<{ result: { content?: { type: string; text?: string; mimeType?: string }[]; isError?: boolean; structuredContent?: unknown }; ms: number; bytes: number; isError: boolean }>
    resource: (uri: string) => Promise<{ contents: { uri: string; text?: string; mimeType?: string; blob?: string }[] }>
    prompt: (name: string, args: Record<string, string>) => Promise<{ messages: { role: string; content: { type: string; text?: string } }[] }>
    close: () => Promise<void>
  }
  mcat: {
    state: () => Promise<{ count: number; categories: string[]; keys: Record<string, string[]> }>
    refresh: () => Promise<number>
    search: (f: import('../shared/mcpcat').Filter) => Promise<import('../shared/mcpcat').Entry[]>
    details: (repo: string) => Promise<{ entry: import('../shared/mcpcat').Entry; license: string | null; config: import('../shared/mcpcat').Config | null; pushedDaysAgo: number | null; stars: number | null; review: import('../shared/mcpcat').Review; readme: string | null; checked: { readme: boolean; license: boolean; activity: boolean } }>
    install: (o: { name: string; scope: 'user' | 'project'; cwd: string; config: import('../shared/mcpcat').Config; values: Record<string, string> }) => Promise<{ name: string; file: string }>
    uninstall: (name: string, scope: 'user' | 'project', cwd: string) => Promise<void>
  }
  prom: {
    conf: () => Promise<{ url: string; saved: { name: string; query: string }[]; hasToken: boolean }>
    setUrl: (url: string) => Promise<{ url: string; saved: { name: string; query: string }[] }>
    save: (name: string, q: string) => Promise<{ url: string; saved: { name: string; query: string }[] }>
    unsave: (name: string) => Promise<{ url: string; saved: { name: string; query: string }[] }>
    alerts: () => Promise<import('../shared/prom').Alert[]>
    targets: () => Promise<import('../shared/prom').Target[]>
    range: (q: string, seconds: number) => Promise<{ series: import('../shared/prom').Series[]; dropped: number }>
    ask: (q: string) => Promise<string>
  }
  ph: {
    state: () => Promise<{ conn: import('../shared/posthog').Conn; hasKey: boolean }>
    setConn: (c: import('../shared/posthog').Conn) => Promise<import('../shared/posthog').Conn>
    projects: () => Promise<{ id: number; name: string }[]>
    query: (q: string) => Promise<import('../shared/posthog').Result>
    flags: () => Promise<import('../shared/posthog').Flag[]>
    setFlag: (id: number, change: { active?: boolean; rollout?: number }) => Promise<import('../shared/posthog').Flag>
    experiments: () => Promise<{ id: number; name: string; feature_flag_key: string; start_date: string | null; end_date: string | null; description?: string }[]>
    ask: (q: string) => Promise<string>
    stack: (type: string, message: string, cwd?: string) => Promise<(import('../shared/posthog').Frame & { local: string | null })[]>
  }
  leak: {
    state: (project: string) => Promise<{ trufflehog: string | null; verify: boolean; git: boolean; hook: 'none' | 'ours' | 'other'; scans: LeakScan[]; resolved: Record<string, { note: string; at: number }> }>
    scan: (project: string, source: 'git' | 'filesystem') => Promise<LeakScan>
    verify: (on: boolean) => Promise<void>
    resolve: (project: string, fp: string, note: string | null) => Promise<Record<string, { note: string; at: number }>>
    hook: (project: string, on: boolean) => Promise<'none' | 'ours' | 'other'>
    steps: (l: import('../shared/leaks').Leak) => Promise<{ steps: string[]; vaultName: string; rotate: string | null }>
  }
  sec: {
    state: (project: string) => Promise<{ trivy: string | null; scans: SecScan[]; accepted: import('../shared/trivy').Accepted[]; gates: Record<string, string> }>
    scan: (project: string, kind: import('../shared/trivy').Kind, target: string) => Promise<SecScan>
    accept: (project: string, key: string, note: string, days: number) => Promise<import('../shared/trivy').Accepted[]>
    unaccept: (project: string, key: string) => Promise<import('../shared/trivy').Accepted[]>
    sbom: (project: string, format: 'cyclonedx' | 'spdx-json') => Promise<string>
    setGate: (uuid: string, project: string | null) => Promise<Record<string, string>>
    fixMessage: (f: import('../shared/trivy').Finding) => Promise<string>
  }
  wb: {
    state: () => Promise<WbState>
    save: (p: Partial<import('../shared/workbench').Prompt>, note?: string) => Promise<WbState>
    remove: (id: string) => Promise<WbState>
    catalog: (q: string) => Promise<import('../shared/workbench').Prompt[]>
    importCatalog: () => Promise<WbState>
    adopt: (id: string) => Promise<WbState>
    setFilters: (persona: string, f: import('../shared/workbench').Filter[]) => Promise<WbState>
    rate: (sid: string, value: number, reply: string, note?: string) => Promise<boolean>
  }
  s2c: {
    list: () => Promise<Omit<import('../electron/shot2code').Job, 'image'>[]>
    get: (id: string) => Promise<import('../electron/shot2code').Job | null>
    start: (o: { name: string; target: import('../shared/shot2code').Target; project: string; image: string; rounds: number; maxDiff: number; note?: string }) => Promise<string>
    stop: (id: string) => Promise<void>
    apply: (id: string, n: number | null, folder: string, overwrite: boolean) => Promise<{ written: string[]; clash: string[] }>
    prototype: (ids: string[], folder: string) => Promise<string>
    onProgress: (cb: (p: { id: string; round: import('../electron/shot2code').RoundView | null; note: string }) => void) => () => void
  }
  models: {
    state: () => Promise<{ endpoints: import('../shared/modelserver').Endpoint[]; hosts: string[]; tunnels: { host: string; local: number; remote: number }[]; small: string | null; presets: typeof import('../shared/modelserver').PRESETS; shapes: typeof import('../shared/modelserver').SHAPES }>
    save: (e: Partial<import('../shared/modelserver').Endpoint>) => Promise<import('../shared/modelserver').Endpoint[]>
    remove: (id: string) => Promise<import('../shared/modelserver').Endpoint[]>
    list: (id: string) => Promise<string[]>
    test: (id: string, model: string, prompt: string) => Promise<{ text: string; ttftMs: number | null; totalMs: number; outTokens: number | null; tokensPerSec: number | null }>
    metrics: (id: string) => Promise<import('../shared/modelserver').ServerStats>
    preview: (a: import('../shared/modelserver').VllmArgs) => Promise<string>
    start: (host: string, a: import('../shared/modelserver').VllmArgs) => Promise<{ log: string }>
    stop: (host: string, port: number) => Promise<string>
    log: (host: string, port: number) => Promise<string>
    tunnel: (host: string, local: number, remote: number, open: boolean) => Promise<{ host: string; local: number; remote: number }[]>
  }
  monitor: {
    list: () => Promise<MonitorRow[]>
    history: (id: string) => Promise<import('../shared/monitors').Beat[]>
    save: (m: Partial<import('../shared/monitors').Monitor>) => Promise<MonitorRow[]>
    remove: (id: string) => Promise<MonitorRow[]>
    check: (id: string) => Promise<MonitorRow[]>
    page: (title: string, dir?: string | null) => Promise<string | null>
    pageTitle: () => Promise<string>
    netdataUrl: () => Promise<string>
    setNetdata: (url: string) => Promise<string>
    netdata: () => Promise<{ host: string; version: string; os: string; alarms: import('../shared/monitors').NetdataAlarm[]; cpu: Record<string, number>; load: Record<string, number>; ram: Record<string, number> } | null>
    onBeat: (cb: () => void) => () => void
  }
  obs: {
    turns: () => Promise<(import('../shared/trace').TraceTurn & { sid: string; scores: Record<string, import('../shared/spans').Score> })[]>
    score: (turn: string, name: string, value: number, note?: string) => Promise<import('../shared/spans').Score>
    datasets: () => Promise<import('../shared/spans').Dataset[]>
    saveDataset: (ds: import('../shared/spans').Dataset) => Promise<import('../shared/spans').Dataset[]>
    deleteDataset: (id: string) => Promise<import('../shared/spans').Dataset[]>
    staging: () => Promise<Record<string, import('../electron/observe').Staging>>
    setStaging: (id: string, s: { instructions: string; note?: string } | null) => Promise<Record<string, import('../electron/observe').Staging>>
    promote: (id: string) => Promise<Record<string, import('../electron/observe').Staging>>
    run: (datasetId: string, variants: import('../electron/observe').Variant[], must: string[]) => Promise<Experiment>
    stop: () => Promise<void>
    experiments: () => Promise<Experiment[]>
    otel: () => Promise<import('../electron/observe').Otel>
    setOtel: (o: import('../electron/observe').Otel) => Promise<import('../electron/observe').Otel>
    export: (ids: string[]) => Promise<{ ok: boolean; status?: number; error?: string }>
  }
  providers: {
    state: () => Promise<{ list: import('../shared/claudeconf').Provider[]; active: string | null; file: string; exists: boolean; helperInstalled: boolean; backups: string[] }>
    preview: (id: string) => Promise<{ before: string; after: string; lines: { sign: ' ' | '+' | '-'; text: string }[]; keyMissing: boolean }>
    apply: (id: string) => Promise<string | null>
    restore: (name: string) => Promise<void>
    save: (p: import('../shared/claudeconf').Provider) => Promise<void>
    remove: (id: string) => Promise<void>
  }
  registry: {
    state: (cwd: string) => Promise<{ mcp: import('../electron/registry').Installed[]; skills: { name: string; title: string; description: string; where?: string }[]; personas: { id: string; name: string; color: string; mcpOff: string[]; skillsOff: string[] }[] }>
    toggle: (persona: string, kind: 'mcp' | 'skill', name: string, on: boolean) => Promise<void>
  }
  sessionLogs: {
    list: (cwd: string) => Promise<{ file: string; at: number; size: number; first: string; turns: number; files: number; failed: number }[]>
    read: (cwd: string, file: string) => Promise<import('../shared/sessionlog').LogTurn[]>
  }
  quota: {
    tray: () => Promise<{ title: string }>
  }
  diagram: {
    list: (cwd: string) => Promise<{ path: string; name: string; at: number }[]>
    open: (path: string) => Promise<{ model: string; versions: import('../electron/diagrams').DiagramVersion[] }>
    create: (cwd: string, name: string, text: string) => Promise<string>
    edit: (path: string, text: string, ids: string[]) => Promise<string>
    fromImage: (cwd: string, name: string, hint: string, chosen?: string[]) => Promise<string | null>
    er: (cwd: string, name: string, schema: import('../electron/db').DbSchema) => Promise<string>
    template: (cwd: string, name: string, id: string) => Promise<string>
    restore: (path: string, at: number) => Promise<void>
    save: (path: string, model: string, note: string) => Promise<void>
    external: (path: string) => Promise<string>
  }
  inbox: {
    load: () => Promise<{ list: import('../shared/inbox').Conversation[]; errors: { source: import('../shared/inbox').Source; error: string }[]; replies: import('../shared/inbox').SavedReply[]; views: import('../shared/inbox').View[]; hours: import('../shared/inbox').Hours; me: string; connected: Record<import('../shared/inbox').Source, boolean> }>
    status: (key: string, status: import('../shared/inbox').Status, snooze?: { until?: number; untilReply?: boolean }) => Promise<void>
    labels: (key: string, labels: string[]) => Promise<void>
    note: (key: string, text: string, remove?: number) => Promise<void>
    replies: (r: import('../shared/inbox').SavedReply[]) => Promise<void>
    views: (v: import('../shared/inbox').View[]) => Promise<void>
    hours: (h: import('../shared/inbox').Hours) => Promise<void>
    suggest: (key: string) => Promise<string | null>
    send: (key: string, text: string) => Promise<void>
  }
  docs: {
    state: () => Promise<{ queue: import('../electron/docstore').Job[]; docs: import('../electron/docstore').Doc[]; rules: import('../shared/docrules').Rule[]; template: string; folder: string; facts: number; tags: string[]; models: { small: string; embed: string } }>
    setFolder: (chosen?: string | null) => Promise<string>
    addFiles: (paths?: string[]) => Promise<number>
    retry: (id: number) => Promise<void>
    doc: (id: number) => Promise<{ doc?: import('../electron/docstore').Doc; chunks: import('../electron/docstore').Chunk[]; facts: import('../electron/docstore').Fact[] }>
    setTags: (id: number, tags: string[]) => Promise<void>
    reject: (id: number, tag: string) => Promise<void>
    chunk: (id: number, text: string) => Promise<void>
    addChunk: (doc: number, text: string) => Promise<void>
    merge: (id: number) => Promise<void>
    split: (id: number, at: number) => Promise<void>
    compiled: (id: number) => Promise<{ version: number; text: string; at: number; how: string }[]>
    compile: (id: number, how: 'outline' | 'local' | 'claude') => Promise<{ version: number; tokensWhole: number; tokensCompiled: number }>
    fact: (id: number, ok: boolean) => Promise<unknown>
    rule: (r: import('../shared/docrules').Rule) => Promise<void>
    dropRule: (id: string) => Promise<void>
    template: (t: string) => Promise<void>
    search: (q: string, tag?: string) => Promise<import('../electron/docstore').Hit[]>
    show: (id: number) => Promise<void>
    remove: (id: number) => Promise<void>
    onChanged: (fn: () => void) => () => void
    onStage: (fn: (s: import('../electron/docstore').SearchStage) => void) => () => void
  }
  sites: {
    list: () => Promise<import('../shared/webapps').Site[]>
    save: (input: import('../shared/webapps').SiteInput, id?: string) => Promise<import('../shared/webapps').Site[]>
    remove: (id: string) => Promise<import('../shared/webapps').Site[]>
  }
  transcript: {
    get: (r: import('../electron/transcripts').Request) => Promise<import('../electron/transcripts').Result>
    enabled: (on?: boolean) => Promise<boolean>
    tools: () => Promise<{ ytdlp: boolean; whisper: boolean; ffmpeg: boolean; model: boolean } | null>
  }
  brief: {
    sources: () => Promise<{ reddit: boolean; youtube: boolean }>
    connectReddit: (id: string, secret: string) => Promise<void>
    youtubeKey: (key: string) => Promise<void>
    run: (r: { query: string; days: number; sources: import('../shared/last30').BriefSource[]; cwd?: string }) => Promise<import('../electron/last30').BriefResult>
  }
  research: {
    run: (r: import('../electron/research').Run & { cwd?: string }) => Promise<import('../electron/research').ResearchEvent>
    stop: () => Promise<void>
    save: (cwd: string, topic: string, report: string, sources: import('../shared/research').Source[]) => Promise<string>
    extract: (target: string, schema: string) => Promise<unknown>
    onEvent: (fn: (e: import('../electron/research').ResearchEvent) => void) => () => void
  }
  reader: {
    config: () => Promise<import('../electron/web/reader').WebConfig & { ready: boolean }>
    setCache: (rules: import('../shared/leanfetch').CacheRule[]) => Promise<import('../electron/web/reader').WebConfig>
    setSearch: (url: string) => Promise<import('../electron/web/reader').WebConfig>
    dropSchema: (name: string) => Promise<import('../electron/web/reader').WebConfig>
    extract: (url: string, name: string) => Promise<{ schema?: string; items?: unknown[]; error?: string }>
    tryRead: (url: string, question: string, mode: 'page' | 'crawl') => Promise<{ page?: import('../electron/web/reader').Page; crawl?: import('../electron/web/reader').Crawl }>
  }
  team: {
    exportFile: (name: string, dir?: string | null) => Promise<{ file: string; personas: number; triggers: number; evals: number; dropped: string[] } | null>
    open: (path?: string, chosen?: string[]) => Promise<{ team: import('../shared/team').Team; changes: import('../shared/team').Change[] } | null>
    apply: (team: import('../shared/team').Team, picked: string[]) => Promise<{ personas: number; triggers: number }>
  }
  design: {
    extract: (url: string) => Promise<{ url: string; title: string; tokens: import('../shared/styleExtract').Tokens; css: string; tailwind: string; shot: string; elements: number }>
    inventory: (cwd: string) => Promise<import('../electron/inventory').Inventory>
    consolidate: (cwd: string, key: string) => Promise<string>
  }
  deploys: {
    advisors: () => Promise<{ missing?: string; projects: import('../electron/deploys').Advice[] }>
    lintMessage: (project: { ref: string; name: string }, lint: import('../electron/deploys').Lint) => Promise<string>
    dokploy: () => Promise<{ url: string; apps: import('../electron/deploys').CoolifyApp[]; missing?: string; healthPaths: Record<string, string> }>
    setDokployUrl: (url: string) => Promise<string>
    dokployDeploy: (id: string) => Promise<string>
    dokployRollback: (id: string, rollbackId: string) => Promise<string>
    coolify: () => Promise<{ url: string; apps: import('../electron/deploys').CoolifyApp[]; missing?: string; healthPaths: Record<string, string> }>
    setUrl: (url: string) => Promise<string>
    setHealth: (uuid: string, path: string) => Promise<void>
    deploy: (uuid: string) => Promise<string>
    rollback: (uuid: string, commit: string) => Promise<string>
    history: (uuid: string) => Promise<import('../electron/deploys').Deployment[]>
    onEvent: (fn: (e: DeployEvent) => void) => () => void
  }
  panelBus: { onInbox: (fn: (sid: string, text: string, sent: boolean) => void) => () => void; links: () => Promise<Record<string, PanelLinkView[]>>; onLinks: (fn: (v: Record<string, PanelLinkView[]>) => void) => () => void; setAuto: (a: string, b: string, on: boolean) => Promise<Record<string, PanelLinkView[]>>; setCap: (a: string, b: string, usd: number) => Promise<Record<string, PanelLinkView[]>> }
  stmCli: { onOpen: (fn: (r: { req: string; cwd?: string; persona?: string; model?: string }) => void) => () => void; opened: (req: string, sid: string) => void; install: () => Promise<{ file: string; onPath: boolean; hint: string }> }
  vec: { status: (cwd: string) => Promise<{ model: string | null; models: string[]; size: number; total: number; project: string }>; model: (m: string | null) => Promise<string | null>; build: (cwd: string) => Promise<{ total: number; done: number }> }
  memtest: (cwd: string, question: string, where: 'local' | 'claude') => Promise<{ without: string; withMem: string; backedWithout: number; backedWith: number; agree: number }>
  goal: { set: (sid: string, text: string | null) => Promise<import('../shared/goal').Goal | null>; get: (sid: string) => Promise<import('../shared/goal').Goal | null> }
  headroomLearn: (cwd: string, apply: boolean) => Promise<{ ok: boolean; text: string }>
  spec: {
    list: (cwd: string) => Promise<{ slug: string; title: string; spec: boolean; plan: boolean; tasks: import('../shared/spec').SpecTask[] | null; at: number }[]>
    constitution: (cwd: string) => Promise<{ text: string; saved: boolean }>
    saveConstitution: (cwd: string, text: string) => Promise<boolean>
  }
  guardInject: (text: string) => Promise<import('../shared/injection').InjectionFinding[]>
  /** saved vault values that appear in `text` */
  guardSecrets: (text: string) => Promise<import('../shared/secrets').Finding[]>
  memoryNode: (id: string) => Promise<{ project: string; node: import('../electron/memtree').MemNode } | null>
  drop: (sid: string) => Promise<void>
  budget: {
    get: () => Promise<{ limits: import('../shared/budget').Limits; spend: import('../shared/budget').Spend; panels: Record<string, { total: number; next: number }> }>
    set: (limits: import('../shared/budget').Limits) => Promise<import('../shared/budget').Limits>
  }
  pickFiles: () => Promise<import('../shared/attach').Attachment[]>
  /** Attachments for paths chosen in the in-app file picker. */
  attachPaths: (paths: string[]) => Promise<import('../shared/attach').Attachment[]>
  /** One file the in-app picker chose, read whole (up to 20 MB). */
  readPicked?: (path: string) => Promise<{ name: string; data: string }>
  filePick: {
    list: (dir: string, hidden?: boolean) => Promise<import('../electron/filepick').Listing>
    project: (dir: string, hidden?: boolean) => Promise<import('../electron/filepick').Listing>
    recent: (attached: string[], hidden?: boolean) => Promise<{ entries: import('../electron/filepick').PickEntry[]; denied: string[]; home: string }>
    thumb: (path: string) => Promise<string | null>
  }
  isDir: (path: string) => Promise<boolean>
  pathOf: (file: File) => string
  interrupt: (sid: string) => Promise<void>
  loopSettings: (next?: Partial<import('../shared/loopguard').LoopConfig>) => Promise<import('../shared/loopguard').LoopConfig>
  loopQuiet: (sid: string) => Promise<boolean>
  /** `command` edits a Bash command before it runs; `note` goes back to the agent with a denial */
  answer: (sid: string, id: string, allow: boolean, extra?: { command?: string; note?: string; tool?: string }) => Promise<void>
  onEvent: (fn: (sid: string, e: UiEvent | ShellEvent | Exposure) => void) => () => void
}

declare global {
  interface Window {
    stm: Bridge
  }
}

export type DeployEvent = { uuid: string; at: number; stage: string; status: string; id?: string; commit?: string; ok?: boolean; note?: string; url?: string; rollback?: string; health?: import('../electron/deploys').Health }

export type SkillDraftRow = { id: string; at: number; project: string; cwd: string; draft: import('../shared/skilldraft').SkillDraft; source?: import('../shared/skillimport').SkillSource }

export type Booking = { account: string; name: string; title: string; who: string; rules: import('../shared/slots').SlotRules; url?: string; publishedAt?: number }
export type BookingRequest = { id: string; slot: string; name: string; email: string; note: string; at: string; status: 'pending' | 'accepted' | 'declined' }

export type QuotaState = { source: import('../shared/quotapolicy').Source; paused: boolean; customOn: boolean; customUrl: string; hasKey: boolean }

export type BwState = import('../electron/bitwarden').Status & { links: { name: string; label: string; field: string; shown: string | null }[] }

export type RadarCfg = { groups: string; weights: Record<string, number>; lastAt: number; ntfy: string }
