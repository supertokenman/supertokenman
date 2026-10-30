// Packs in the main process (spec-packs.md, T8): the store, the sources (built-in, shipped skills, a folder,
// a git URL), install, update, rollback and remove with their journal, and the MCP servers a project turns on.
// The decisions are the pure functions in app/shared/pack*.ts; this file only reads and writes disk and runs
// git. Nothing from a pack is ever executed here, and nothing touches the network except `fetchGit`, which
// the window calls only on a click.

import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync, type Stats } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { scanInjection } from '../shared/injection.js'
import { parseManifest, type Manifest } from '../shared/packmanifest.js'
import { planUpdate as planMerge, type Entry, type Hash } from '../shared/packmerge.js'
import { allowedTarget, inside, rejectSymlinks, safeRel } from '../shared/packpath.js'
import { planInstall, rulesUpsert, targetOf, type FsEntry, type InstallPlan } from '../shared/packplan.js'
import { planRemove as planRemoveFiles, type RemovePlan } from '../shared/packremove.js'
import { emptyState, findInstall, readState, recordRollback, recordUpdate, removeInstall, upsertInstall, writeState, type PackInstall, type PackState } from '../shared/packstate.js'

export type Scope = 'project' | 'global'
export type Origin = 'builtin' | 'shipped' | 'mine'
export type PackSource = PackInstall['source']
export type InstallDecision = 'skip' | 'overwrite'
export type UpdateDecision = 'mine' | 'theirs' | 'beside' | 'recreate' | 'leave'

export type GitRun = (args: string[], opts: { env: Record<string, string | undefined>; timeoutMs: number }) => Promise<{ ok: boolean; out: string }>

export type PackDeps = {
  userData: string
  /** The folder holding `packs/` (built-in) and `skills/` (shipped skills). */
  enginesDir: string
  /** `~/.claude`: the root of a global install. */
  claudeDir: () => string
  vaultGet: (name: string) => string | undefined
  now?: () => number
  git?: GitRun
}

const MAX_FILE = 1024 * 1024
const MAX_TOTAL = 10 * 1024 * 1024
const MAX_ENTRIES = 5000
const MAX_DEPTH = 20
const RULES_ID = '@rules'
const BYPASS = /--dangerously-skip-permissions|bypassPermissions|permission mode\b.{0,20}\bbypass|(?:skip|disable|turn off|without)\b.{0,30}\b(?:permission|approval)s?\b/i

export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const rand = () => randomBytes(4).toString('hex')
const isDir = (p: string) => {
  try {
    return lstatSync(p).isDirectory()
  } catch {
    return false
  }
}

export function cmpVersion(a: string, b: string): number {
  const p = (v: string) => v.split('-')[0]!.split('.').map(Number)
  const [x, y] = [p(a), p(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  const [pa, pb] = [a.includes('-'), b.includes('-')]
  return pa === pb ? 0 : pa ? -1 : 1
}

// ---- scanning a pack folder (lstat walk, caps, hashes) ------------------------------------------------

export type Scanned = { manifest: Manifest; text: string; hashes: Record<string, string>; bytes: Record<string, number> }
export type ScanResult = ({ ok: true } & Scanned) | { ok: false; errors: string[] }

function walk(dir: string, skip: (rel: string) => boolean) {
  const stats = new Map<string, Stats>()
  const errors: string[] = []
  const stack = ['']
  while (stack.length) {
    const rel = stack.pop()!
    let names: string[]
    try {
      names = readdirSync(rel ? join(dir, rel) : dir)
    } catch {
      errors.push(`cannot read ${rel || '.'}`)
      continue
    }
    for (const n of names) {
      const r = rel ? `${rel}/${n}` : n
      if (skip(r)) continue
      if (stats.size >= MAX_ENTRIES) return { stats, errors: [...errors, `more than ${MAX_ENTRIES} entries in the pack`] }
      if (r.split('/').length > MAX_DEPTH) {
        errors.push(`${r}: folders nested deeper than ${MAX_DEPTH}`)
        continue
      }
      const st = lstatSync(join(dir, r))
      stats.set(r, st)
      if (st.isDirectory()) stack.push(r)
    }
  }
  return { stats, errors }
}

/** Reads a pack folder without following links and checks it against its manifest. Nothing in it is run. */
export function scanSource(dir: string, o: { manifestText?: string; skipGit?: boolean } = {}): ScanResult {
  let top: Stats
  try {
    top = lstatSync(dir)
  } catch {
    return { ok: false, errors: ['the folder is not there'] }
  }
  if (top.isSymbolicLink() || !top.isDirectory()) return { ok: false, errors: ['not a folder (or a link to one)'] }
  const { stats, errors } = walk(dir, (r) => Boolean(o.skipGit) && (r === '.git' || r.startsWith('.git/')))
  if (errors.length) return { ok: false, errors }
  const links = rejectSymlinks(stats)
  if (!links.ok) return { ok: false, errors: [links.reason] }
  let text = o.manifestText
  if (text === undefined) {
    const st = stats.get('pack.json')
    if (!st?.isFile()) return { ok: false, errors: ['pack.json: missing'] }
    if (st.size > 64 * 1024) return { ok: false, errors: ['pack.json: larger than 64 KB'] }
    text = readFileSync(join(dir, 'pack.json'), 'utf8')
  }
  const parsed = parseManifest(text)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  const hashes: Record<string, string> = {}
  const bytes: Record<string, number> = {}
  const bad: string[] = []
  let total = 0
  for (const f of parsed.manifest.files) {
    const safe = safeRel(f.from)
    if (!safe.ok) {
      bad.push(`files.from ${f.from}: ${safe.reason}`)
      continue
    }
    const to = allowedTarget(parsed.manifest.id, f.to)
    if (!to.ok) {
      bad.push(`files.to ${f.to}: ${to.reason}`)
      continue
    }
    if (hashes[f.from]) continue
    const st = stats.get(f.from)
    if (!st?.isFile()) {
      bad.push(`${f.from}: not a file in the pack`)
      continue
    }
    if (st.size > MAX_FILE) {
      bad.push(`${f.from}: larger than 1 MB`)
      continue
    }
    total += st.size
    hashes[f.from] = sha256(readFileSync(join(dir, f.from)))
    bytes[f.from] = st.size
  }
  if (total > MAX_TOTAL) bad.push('the pack files total more than 10 MB')
  if (bad.length) return { ok: false, errors: bad }
  return { ok: true, manifest: parsed.manifest, text, hashes, bytes }
}

/** A manifest for a folder of skills the app ships: its files as skills, no servers, no hosts, no env. */
function synthShipped(dir: string, name: string): ScanResult {
  const id = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  const { stats, errors } = walk(dir, () => false)
  if (errors.length) return { ok: false, errors }
  const files = [...stats].filter(([, st]) => st.isFile()).map(([rel]) => rel).sort()
  const manifest = {
    schema: 1,
    id,
    name,
    version: '1.0.0',
    description: 'Skills shipped with the app.',
    files: files.map((from) => ({ from, to: `.claude/skills/${id}/${from}`, kind: /(^|\/)SKILL\.md$/.test(from) ? 'skill' : 'file' })),
  }
  return scanSource(dir, { manifestText: JSON.stringify(manifest) })
}

// ---- the rules block and the views the window shows -------------------------------------------------

export const rulesHash = (rules: string) => sha256(rules.trim())

/** The body of this pack's block in CLAUDE.md text, or null when there is none. */
export function blockOf(text: string | null, id: string): string | null {
  if (text === null) return null
  const lines = text.split('\n')
  const start = lines.findIndex((l) => new RegExp(`^<!-- stm-pack:${id} v\\S+ start -->$`).test(l))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && l === `<!-- stm-pack:${id} end -->`)
  return end < 0 ? null : lines.slice(start + 1, end).join('\n')
}

export function rulesFlags(text: string): string[] {
  const flags = scanInjection(text).map((f) => f.rule)
  if (BYPASS.test(text)) flags.push('asks to bypass permissions or approvals')
  return [...new Set(flags)]
}

type Server = Manifest['mcp'][number]
export const commandLine = (s: Server) => (s.type === 'stdio' ? [s.command, ...s.args].join(' ') : s.url)

/** An `npx` or `uvx` package with no pinned version fetches whatever is newest at start time. */
export function unpinned(s: Server): string | null {
  if (s.type !== 'stdio' || (s.command !== 'npx' && s.command !== 'uvx')) return null
  const pkg = s.args.find((a) => !a.startsWith('-'))
  if (!pkg) return null
  const pinned = s.command === 'npx' ? /^(@[^/@]+\/)?[^@/]+@(?!latest$)[^@]+$/.test(pkg) : /^[^@=]+(==|@)(?!latest$)[^@=]+$/.test(pkg)
  return pinned ? null : `${pkg} has no pinned version: it fetches the newest code each time it starts`
}

export type ManifestView = ReturnType<typeof manifestView>
export function manifestView(m: Manifest, o: { scope: Scope; vaultHas: (n: string) => boolean }) {
  const notes: string[] = []
  if (o.scope === 'global') notes.push('A global install changes every Claude Code use on this machine, also outside the app.')
  const servers = m.mcp.map((s) => ({
    name: s.name,
    type: s.type,
    line: commandLine(s),
    env: s.type === 'stdio' ? s.env : [],
    host: s.type === 'stdio' ? null : new URL(s.url).hostname,
    warning: unpinned(s),
  }))
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    files: m.files.map((f) => ({ from: f.from, to: targetOf(o.scope, f.to), kind: f.kind })),
    servers,
    hosts: m.hosts,
    env: m.env.map((e) => ({ name: e.name, why: e.why, secret: e.secret, inVault: o.vaultHas(e.name) })),
    rules: m.rules ? { text: m.rules.text, flags: rulesFlags(m.rules.text) } : null,
    notes,
  }
}

// ---- a journal: every change of one run, undone in reverse if the run fails --------------------------

class Journal {
  private undo: (() => void)[] = []
  mkdirp(abs: string) {
    if (isDir(abs)) return
    this.mkdirp(dirname(abs))
    mkdirSync(abs)
    this.undo.push(() => rmdirSync(abs))
  }
  write(abs: string, data: Buffer | string) {
    const prev = existsSync(abs) ? readFileSync(abs) : null
    const tmp = `${abs}.stm-tmp-${rand()}`
    writeFileSync(tmp, data)
    renameSync(tmp, abs)
    this.undo.push(() => (prev ? writeFileSync(abs, prev) : unlinkSync(abs)))
  }
  copy(from: string, to: string) {
    this.write(to, readFileSync(from))
  }
  remove(abs: string) {
    const prev = readFileSync(abs)
    unlinkSync(abs)
    this.undo.push(() => writeFileSync(abs, prev))
  }
  rmdir(abs: string) {
    rmdirSync(abs)
    this.undo.push(() => mkdirSync(abs))
  }
  rollback() {
    for (const u of this.undo.reverse()) {
      try {
        u()
      } catch {
        // best effort: the rest is still undone
      }
    }
    this.undo = []
  }
}

const defaultGit: GitRun = (args, o) =>
  new Promise((ok) => execFile('git', args, { timeout: o.timeoutMs, maxBuffer: 16 * 1024 * 1024, env: o.env as NodeJS.ProcessEnv }, (e, out, err) => ok({ ok: !e, out: `${out ?? ''}${e ? (err ?? '') : ''}`.trim() })))

/** The https URL of a repository, or why it is refused. No credentials in the URL, no other scheme. */
export function gitUrlError(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'not a URL'
  }
  if (u.protocol !== 'https:') return 'only https:// URLs are fetched'
  if (u.username || u.password) return 'a URL with a name or password in it is refused'
  if (!u.hostname || /[\s'"`$;&|<>\\]/.test(url) || url.length > 2048) return 'the URL has characters that are not allowed'
  return null
}

export type Entry_ = {
  id: string
  name: string
  version: string
  description: string
  origin: Origin
  source: PackSource | null
  valid: boolean
  errors: string[]
  hosts: string[]
  usesNetwork: boolean
  servers: string[]
  versions: string[]
}
type Resolved = { ok: true; origin: Origin; dir: string; scan: Scanned; source: PackSource; inStore: boolean } | { ok: false; errors: string[] }

export function createPacks(d: PackDeps) {
  const now = () => (d.now ?? Date.now)()
  const base = () => join(d.userData, 'packs')
  const storeRoot = () => join(base(), 'store')
  const storeDir = (id: string, v: string) => join(storeRoot(), id, v)
  const stateFile = () => join(base(), 'state.json')
  const vaultHas = (n: string) => Boolean(d.vaultGet(n))

  // ---- state ---------------------------------------------------------------------------------------
  function loadState(): { state: PackState; warnings: string[]; writable: boolean } {
    const text = existsSync(stateFile()) ? readFileSync(stateFile(), 'utf8') : null
    const r = readState(text)
    if (r.mode === 'rw') return { state: r.state, warnings: r.warnings, writable: true }
    if (r.mode === 'readonly') return { state: emptyState(), warnings: r.warnings, writable: false }
    return { state: emptyState(), warnings: r.errors.map((e) => `state.json: ${e}`), writable: false }
  }
  function mustWrite(): PackState {
    const s = loadState()
    if (!s.writable) throw new Error(`Packs cannot be changed: ${s.warnings.join(' ') || 'state.json cannot be read'}`)
    return s.state
  }
  function saveState(state: PackState) {
    mkdirSync(base(), { recursive: true })
    const tmp = `${stateFile()}.tmp-${rand()}`
    writeFileSync(tmp, writeState(state))
    renameSync(tmp, stateFile())
  }

  // ---- sources and the store -----------------------------------------------------------------------
  const builtinDir = (id: string) => join(d.enginesDir, 'packs', id)
  const shippedDir = (id: string) => join(d.enginesDir, 'skills', id)
  const names = (dir: string) => {
    try {
      return readdirSync(dir).filter((n) => isDir(join(dir, n))).sort()
    } catch {
      return []
    }
  }
  const storeVersions = (id: string) => names(join(storeRoot(), id)).filter((v) => !v.includes('.tmp-')).sort(cmpVersion)
  const sourceMeta = (id: string, v: string): { origin: Origin; source: PackSource } | null => {
    try {
      return JSON.parse(readFileSync(join(storeRoot(), id, `${v}.source.json`), 'utf8'))
    } catch {
      return null
    }
  }

  function scanBuiltin(id: string): Resolved {
    const dir = builtinDir(id)
    const s = scanSource(dir)
    if (!s.ok) return s
    if (s.manifest.id !== id) return { ok: false, errors: [`id: ${s.manifest.id} does not match the folder ${id}`] }
    return { ok: true, origin: 'builtin', dir, scan: s, source: { kind: 'folder', path: dir }, inStore: false }
  }
  function scanShipped(id: string): Resolved {
    const dir = shippedDir(id)
    const s = synthShipped(dir, id)
    return s.ok ? { ok: true, origin: 'shipped', dir, scan: s, source: { kind: 'folder', path: dir }, inStore: false } : s
  }
  function scanStored(id: string, v: string): Resolved {
    const dir = storeDir(id, v)
    const s = scanSource(dir)
    if (!s.ok) return s
    const meta = sourceMeta(id, v)
    return { ok: true, origin: meta?.origin ?? 'mine', dir, scan: s, source: meta?.source ?? { kind: 'folder', path: dir }, inStore: true }
  }

  /** A pack by id (and version): the store first when a version is named, else built-in, shipped, newest stored. */
  function resolvePack(id: string, version?: string): Resolved {
    if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(id)) return { ok: false, errors: ['not a pack id'] }
    if (version && /^\d/.test(version) && storeVersions(id).includes(version)) return scanStored(id, version)
    for (const r of [existsSync(builtinDir(id)) ? scanBuiltin(id) : null, existsSync(shippedDir(id)) ? scanShipped(id) : null]) {
      if (r && (!r.ok || !version || r.scan.manifest.version === version)) return r
    }
    const v = version ?? storeVersions(id).at(-1)
    if (v && storeVersions(id).includes(v)) return scanStored(id, v)
    return { ok: false, errors: [`${id}${version ? ` ${version}` : ''} is not in the catalog`] }
  }

  function toStore(r: Extract<Resolved, { ok: true }>) {
    if (r.inStore) return storeDir(r.scan.manifest.id, r.scan.manifest.version)
    const m = r.scan.manifest
    const dest = storeDir(m.id, m.version)
    const tmp = `${dest}.tmp-${rand()}`
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'pack.json'), r.scan.text)
    for (const f of new Set(m.files.map((x) => x.from))) {
      mkdirSync(dirname(join(tmp, f)), { recursive: true })
      copyFileSync(join(r.dir, f), join(tmp, f))
    }
    rmSync(dest, { recursive: true, force: true })
    renameSync(tmp, dest)
    writeFileSync(join(storeRoot(), m.id, `${m.version}.source.json`), JSON.stringify({ origin: r.origin, source: r.source }))
    return dest
  }

  function entryOf(id: string, r: Resolved, origin: Origin): Entry_ {
    if (!r.ok) return { id, name: id, version: '', description: '', origin, source: null, valid: false, errors: r.errors, hosts: [], usesNetwork: false, servers: [], versions: [] }
    const m = r.scan.manifest
    return { id: m.id, name: m.name, version: m.version, description: m.description, origin: r.origin, source: r.source, valid: true, errors: [], hosts: m.hosts, usesNetwork: m.hosts.length > 0, servers: m.mcp.map((s) => s.name), versions: [...new Set([...storeVersions(m.id), m.version])].sort(cmpVersion) }
  }

  /** The catalog. Reads disk only; no network. */
  function list() {
    const entries: Entry_[] = []
    for (const id of names(join(d.enginesDir, 'packs'))) entries.push(entryOf(id, scanBuiltin(id), 'builtin'))
    for (const id of names(join(d.enginesDir, 'skills'))) entries.push(entryOf(id, scanShipped(id), 'shipped'))
    for (const id of names(storeRoot())) {
      const v = storeVersions(id).at(-1)
      if (!v) continue
      const r = scanStored(id, v)
      if (r.ok && r.origin !== 'mine') continue
      entries.push(entryOf(id, r, 'mine'))
    }
    const s = loadState()
    return { entries, warnings: s.warnings, writable: s.writable }
  }

  function addFrom(dir: string, origin: Origin, source: PackSource, skipGit: boolean) {
    const s = scanSource(dir, { skipGit })
    if (!s.ok) return { ok: false as const, errors: s.errors }
    const r = { ok: true as const, origin, dir, scan: s, source, inStore: false }
    toStore(r)
    return { ok: true as const, entry: entryOf(s.manifest.id, scanStored(s.manifest.id, s.manifest.version), 'mine') }
  }

  /** A folder the person picked: checked, then copied into the store (never linked). */
  function addFolder(path: string) {
    if (!resolve(path) || resolve(path) !== path) return { ok: false as const, errors: ['an absolute folder path is needed'] }
    return addFrom(path, 'mine', { kind: 'folder', path }, false)
  }

  /** A shallow clone of an https repository into a quarantine folder, then the same checks. Network: click only. */
  async function fetchGit(url: string) {
    const bad = gitUrlError(url)
    if (bad) return { ok: false as const, errors: [bad] }
    const run = d.git ?? defaultGit
    const quarantine = join(base(), 'quarantine', `${Date.now().toString(36)}-${rand()}`)
    mkdirSync(dirname(quarantine), { recursive: true })
    const safe = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.symlinks=false', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always']
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1', GIT_ALLOW_PROTOCOL: 'https' }
    try {
      const c = await run([...safe, 'clone', '--depth', '1', '--no-checkout', '--no-tags', '--single-branch', '--', url, quarantine], { env, timeoutMs: 120_000 })
      if (!c.ok) return { ok: false as const, errors: [`git could not fetch it: ${c.out.split('\n').pop() ?? ''}`] }
      const co = await run(['-C', quarantine, ...safe, 'checkout', '--force', '--no-recurse-submodules', 'HEAD'], { env, timeoutMs: 120_000 })
      if (!co.ok) return { ok: false as const, errors: [`git could not check it out: ${co.out.split('\n').pop() ?? ''}`] }
      const head = await run(['-C', quarantine, 'rev-parse', 'HEAD'], { env, timeoutMs: 20_000 })
      const commit = head.out.trim().slice(0, 40)
      if (!head.ok || !/^[0-9a-f]{7,40}$/.test(commit)) return { ok: false as const, errors: ['git did not say which commit it fetched'] }
      return addFrom(quarantine, 'mine', { kind: 'git', url, commit }, true)
    } finally {
      rmSync(quarantine, { recursive: true, force: true })
    }
  }

  // ---- roots and disk facts ------------------------------------------------------------------------
  function checkRoot(scope: Scope, root: string) {
    if (!root.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(root)) throw new Error('The folder must be an absolute path.')
    const g = resolve(d.claudeDir())
    if (scope === 'global' && resolve(root) !== g) throw new Error('A global install goes to ~/.claude.')
    if (scope === 'project' && resolve(root) === g) throw new Error('~/.claude is the global root; choose the global scope.')
  }

  function probe(root: string, targets: string[]): Map<string, FsEntry> {
    const m = new Map<string, FsEntry>()
    for (const t of targets) {
      const parts = t.split('/')
      for (let i = 1; i <= parts.length; i++) {
        const rel = parts.slice(0, i).join('/')
        if (m.has(rel)) continue
        try {
          const st = lstatSync(join(root, rel))
          m.set(rel, { type: st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'dir' : 'file' })
        } catch {
          // missing
        }
      }
    }
    return m
  }
  /** Fails when the path, or a folder above it, is a link: a link is never followed. */
  function noLinks(root: string, rel: string) {
    const parts = rel.split('/')
    for (let i = 1; i <= parts.length; i++) {
      try {
        if (lstatSync(join(root, parts.slice(0, i).join('/'))).isSymbolicLink()) throw new Error(`${parts.slice(0, i).join('/')} is a link; packs never write through links.`)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        return
      }
    }
  }
  /** Hash of the regular file at root/rel; null when missing; `link:` for a link (never equal to a real hash). */
  function diskHash(root: string, rel: string): Hash {
    try {
      const abs = join(root, rel)
      const st = lstatSync(abs)
      if (st.isSymbolicLink()) return 'link:' + rel
      if (!st.isFile()) return 'dir:' + rel
      return sha256(readFileSync(abs))
    } catch {
      return null
    }
  }
  const readText = (abs: string) => (existsSync(abs) ? readFileSync(abs, 'utf8') : null)

  // ---- install -------------------------------------------------------------------------------------
  function installPlan(r: Extract<Resolved, { ok: true }>, scope: Scope, root: string, decisions: Record<string, InstallDecision>, state: PackState): InstallPlan {
    const m = r.scan.manifest
    const targets = m.files.map((f) => targetOf(scope, f.to))
    return planInstall(m, probe(root, targets), state, {
      scope,
      root,
      source: r.source,
      hashes: r.scan.hashes,
      rulesSha256: m.rules ? rulesHash(m.rules.text) : null,
      now: now(),
      decisions,
      hostsApproved: m.hosts,
    })
  }
  const planView = (p: InstallPlan) => ({ errors: p.errors, conflicts: p.conflicts, blocked: p.blocked, writes: p.ops.filter((o) => o.op === 'write').length, dirs: p.ops.filter((o) => o.op === 'mkdir').length, rules: p.ops.some((o) => o.op === 'rulesUpsert') })

  /** What an install would do: the manifest as the person must see it, and the plan with its conflicts. */
  function review(packId: string, version: string, scope: Scope, root: string) {
    checkRoot(scope, root)
    const r = resolvePack(packId, version)
    if (!r.ok) return { ok: false as const, errors: r.errors }
    const plan = installPlan(r, scope, root, {}, loadState().state)
    return { ok: true as const, view: manifestView(r.scan.manifest, { scope, vaultHas }), plan: planView(plan), source: r.source, origin: r.origin }
  }

  function install(packId: string, version: string, scope: Scope, root: string, decisions: Record<string, InstallDecision> = {}) {
    checkRoot(scope, root)
    const state = mustWrite()
    const r = resolvePack(packId, version)
    if (!r.ok) throw new Error(r.errors.join('; '))
    const plan = installPlan(r, scope, root, decisions, state)
    if (plan.errors.length) throw new Error(plan.errors.join('; '))
    if (plan.blocked) throw new Error(`Choose skip or overwrite for: ${plan.conflicts.filter((c) => !decisions[c.to]).map((c) => c.to).join(', ')}`)
    const dir = toStore(r)
    const j = new Journal()
    try {
      if (scope === 'global') j.mkdirp(root)
      let record: PackInstall | undefined
      for (const op of plan.ops) {
        if (op.op === 'mkdir') {
          noLinks(root, op.path)
          j.mkdirp(join(root, op.path))
        } else if (op.op === 'write') {
          noLinks(root, op.to)
          const bytes = readFileSync(join(dir, op.from))
          if (sha256(bytes) !== op.sha256) throw new Error(`${op.from} changed while installing`)
          const abs = join(root, op.to)
          if (op.backup && existsSync(abs)) j.copy(abs, `${abs}.stm-backup`)
          j.write(abs, bytes)
        } else if (op.op === 'rulesUpsert') {
          const f = join(root, op.file)
          noLinks(root, op.file)
          j.write(f, rulesUpsert(readText(f) ?? '', op.packId, op.version, op.rules))
        } else if (op.op === 'stateRecord') record = op.record
      }
      if (!record) throw new Error('nothing to record')
      saveState(upsertInstall(state, record))
      prune()
      return { ok: true as const, install: record }
    } catch (e) {
      j.rollback()
      throw e
    }
  }

  // ---- update and rollback -------------------------------------------------------------------------
  const claudeFile = (root: string) => join(root, 'CLAUDE.md')
  const currentBlockHash = (root: string, id: string): Hash => {
    const b = blockOf(readText(claudeFile(root)), id)
    return b === null ? null : sha256(b)
  }
  function findForRoot(packId: string, root: string, state: PackState) {
    const i = state.installs.find((x) => x.packId === packId && resolve(x.root) === resolve(root))
    if (!i) throw new Error(`${packId} is not installed in ${root}.`)
    return i
  }

  type NewFile = { to: string; from: string; sha: string }
  function updatePlan(inst: PackInstall, toVersion: string) {
    const r = resolvePack(inst.packId, toVersion)
    if (!r.ok) return { ok: false as const, errors: r.errors }
    if (r.scan.manifest.version !== toVersion) return { ok: false as const, errors: [`${toVersion} is not available`] }
    const m = r.scan.manifest
    const errors: string[] = []
    const next = new Map<string, NewFile>()
    for (const f of m.files) {
      const to = targetOf(inst.scope, f.to)
      const chk = allowedTarget(m.id, f.to)
      if (!chk.ok) errors.push(`unsafe target ${f.to}: ${chk.reason}`)
      else next.set(to, { to, from: f.from, sha: r.scan.hashes[f.from]! })
    }
    if (errors.length) return { ok: false as const, errors }
    const baseMap = new Map(inst.files.map((f) => [f.to, f.sha256]))
    const entries: Entry[] = []
    for (const to of new Set([...baseMap.keys(), ...next.keys()])) entries.push({ path: to, base: baseMap.get(to) ?? null, user: diskHash(inst.root, to), next: next.get(to)?.sha ?? null })
    const rulesNext = m.rules ? rulesHash(m.rules.text) : null
    if (inst.rulesSha256 !== null || rulesNext !== null) entries.push({ path: RULES_ID, base: inst.rulesSha256, user: currentBlockHash(inst.root, inst.packId), next: rulesNext })
    const plan = planMerge(entries)
    const text = (rel: string, src: 'mine' | 'theirs') => {
      try {
        if (src === 'mine') return readFileSync(join(inst.root, rel), 'utf8').slice(0, 100_000)
        const f = next.get(rel)
        return f ? readFileSync(join(storeDir(m.id, m.version), f.from), 'utf8').slice(0, 100_000) : ''
      } catch {
        return ''
      }
    }
    const diffs = plan.conflicts.map((path) =>
      path === RULES_ID ? { path, mine: blockOf(readText(claudeFile(inst.root)), inst.packId) ?? '', theirs: m.rules?.text.trim() ?? '' } : { path, mine: text(path, 'mine'), theirs: text(path, 'theirs') },
    )
    const oldHosts = new Set(inst.hostsApproved)
    return {
      ok: true as const,
      resolved: r,
      next,
      plan,
      diffs,
      view: {
        packId: inst.packId,
        from: inst.version,
        to: toVersion,
        items: plan.items,
        conflicts: diffs,
        asks: plan.asks,
        newHosts: m.hosts.filter((h) => !oldHosts.has(h)),
        manifest: manifestView(m, { scope: inst.scope, vaultHas }),
      },
    }
  }

  function planUpdate(packId: string, toVersion: string, root: string) {
    const inst = findForRoot(packId, root, loadState().state)
    const p = updatePlan(inst, toVersion)
    return p.ok ? { ok: true as const, ...p.view } : p
  }

  function applyUpdate(inst: PackInstall, toVersion: string, decisions: Record<string, UpdateDecision>, mode: 'update' | 'rollback') {
    const state = mustWrite()
    const p = updatePlan(inst, toVersion)
    if (!p.ok) throw new Error(p.errors.join('; '))
    const open = [...p.plan.conflicts, ...p.plan.asks].filter((x) => !decisions[x])
    if (open.length) throw new Error(`Decide first: ${open.join(', ')}`)
    const m = p.resolved.scan.manifest
    const dir = toStore(p.resolved)
    const root = inst.root
    const j = new Journal()
    const files: PackInstall['files'] = []
    let rulesSha: string | null = inst.rulesSha256
    const put = (nf: NewFile) => {
      noLinks(root, nf.to)
      j.mkdirp(dirname(join(root, nf.to)))
      const bytes = readFileSync(join(dir, nf.from))
      if (sha256(bytes) !== nf.sha) throw new Error(`${nf.from} changed while updating`)
      j.write(join(root, nf.to), bytes)
    }
    try {
      for (const it of p.plan.items) {
        const dec = decisions[it.path]
        if (it.path === RULES_ID) {
          const f = claudeFile(root)
          const upsert = () => j.write(f, rulesUpsert(readText(f) ?? '', inst.packId, m.version, m.rules!.text))
          const drop = () => {
            const t = readText(f)
            if (t === null || blockOf(t, inst.packId) === null) return
            const out = removeBlock(t, inst.packId)
            if (out.trim() === '') j.remove(f)
            else j.write(f, out)
          }
          const next = m.rules ? rulesHash(m.rules.text) : null
          switch (it.action) {
            case 'update': case 'add': upsert(); rulesSha = next; break
            case 'remove': drop(); rulesSha = null; break
            case 'keep': rulesSha = it.newBase; break
            case 'conflict': if (dec === 'theirs') { upsert(); rulesSha = next } else rulesSha = inst.rulesSha256 === null ? null : next; break
            case 'ask': if (dec === 'recreate' && m.rules) { upsert(); rulesSha = next } else rulesSha = null; break
          }
          continue
        }
        const nf = p.next.get(it.path)
        const abs = join(root, it.path)
        const record = (sha: string | null) => sha !== null && files.push({ to: it.path, sha256: sha })
        switch (it.action) {
          case 'keep': record(it.newBase); break
          case 'update': case 'add': put(nf!); record(nf!.sha); break
          case 'remove': noLinks(root, it.path); j.remove(abs); break
          case 'conflict': {
            const ours = inst.files.some((f) => f.to === it.path)
            if (dec === 'theirs') {
              j.copy(abs, `${abs}.stm-mine`)
              put(nf!)
              record(nf!.sha)
            } else if (dec === 'beside') {
              noLinks(root, it.path)
              j.write(`${abs}.pack-new`, readFileSync(join(dir, nf!.from)))
              if (ours) record(nf!.sha)
            } else if (ours) record(nf!.sha)
            break
          }
          case 'ask': if (dec === 'recreate' && nf) { put(nf); record(nf.sha) } break
        }
      }
      // mcp servers stay on only when they are unchanged; a changed or new one starts off
      const oldM = resolvePack(inst.packId, inst.version)
      const oldServers = oldM.ok ? new Map(oldM.scan.manifest.mcp.map((s) => [s.name, commandLine(s)])) : new Map<string, string>()
      const mcpEnabled: Record<string, boolean> = {}
      for (const s of m.mcp) for (const [k, on] of Object.entries(inst.mcpEnabled)) if (on && (k === s.name || k.startsWith(`${s.name}@`)) && oldServers.get(s.name) === commandLine(s)) mcpEnabled[k] = true
      const to = { version: m.version, files, rulesSha256: rulesSha, source: p.resolved.source, installedAt: now(), mcpEnabled, hostsApproved: m.hosts }
      const key = { packId: inst.packId, scope: inst.scope, root: inst.root }
      saveState(mode === 'rollback' ? recordRollback(state, key, to) : recordUpdate(state, key, to))
      prune()
      return { ok: true as const, install: findInstall(loadState().state, key)! }
    } catch (e) {
      j.rollback()
      throw e
    }
  }

  function update(packId: string, toVersion: string, root: string, decisions: Record<string, UpdateDecision> = {}) {
    return applyUpdate(findForRoot(packId, root, loadState().state), toVersion, decisions, 'update')
  }

  /** Back to the previous version with the same three-way logic. When something needs a decision, nothing changes. */
  function rollback(packId: string, root: string) {
    const inst = findForRoot(packId, root, loadState().state)
    if (!inst.previous) throw new Error(`${packId} has no previous version to go back to.`)
    const p = updatePlan(inst, inst.previous)
    if (!p.ok) throw new Error(p.errors.join('; '))
    if (p.plan.conflicts.length || p.plan.asks.length) return { ok: false as const, needsDecisions: true as const, plan: p.view }
    return applyUpdate(inst, inst.previous, {}, 'rollback')
  }

  // ---- remove --------------------------------------------------------------------------------------
  // planRemove (shared) names pack folders as `.claude/...`; a global install roots at ~/.claude, so its paths
  // are moved under `.claude/` for the plan and back afterwards.
  const up = (inst: PackInstall, p: string) => (inst.scope === 'global' ? `.claude/${p}` : p)
  const down = (inst: PackInstall, p: string) => (inst.scope === 'global' ? p.replace(/^\.claude\//, '') : p)

  function removeInput(inst: PackInstall) {
    const root = inst.root
    const disk: Record<string, Hash> = {}
    for (const f of inst.files) disk[up(inst, f.to)] = diskHash(root, f.to)
    const dirs: Record<string, string[]> = {}
    for (const rr of [`.claude/skills/${inst.packId}`, `.claude/packs/${inst.packId}`]) {
      const stack = [rr]
      while (stack.length) {
        const cur = stack.pop()!
        let kids: string[]
        try {
          kids = readdirSync(join(root, down(inst, cur)))
        } catch {
          continue
        }
        dirs[cur] = kids.map((k) => `${cur}/${k}`)
        for (const k of kids) if (isDir(join(root, down(inst, cur), k))) stack.push(`${cur}/${k}`)
      }
    }
    return { packId: inst.packId, files: inst.files.map((f) => ({ to: up(inst, f.to), sha256: f.sha256 })), rulesSha256: inst.rulesSha256, disk, claudeMd: readText(claudeFile(root)), dirs }
  }
  function removePlan(inst: PackInstall, keepEdited: boolean): RemovePlan {
    const p = planRemoveFiles(removeInput(inst), { keepEdited }, sha256)
    return { ...p, delete: p.delete.map((x) => down(inst, x)), kept: p.kept.map((k) => ({ ...k, to: down(inst, k.to) })), dirs: p.dirs.map((x) => down(inst, x)) }
  }

  function planRemove(packId: string, root: string) {
    const inst = findForRoot(packId, root, loadState().state)
    return { packId, version: inst.version, scope: inst.scope, root: inst.root, ...removePlan(inst, true), mcpEntriesWritten: 0 }
  }

  function remove(packId: string, root: string, keepEdited: boolean) {
    const state = mustWrite()
    const inst = findForRoot(packId, root, state)
    const p = removePlan(inst, keepEdited)
    const j = new Journal()
    try {
      for (const f of p.delete) {
        noLinks(inst.root, f)
        j.remove(join(inst.root, f))
      }
      if (p.rules.action === 'remove' && p.rules.text !== null) {
        const f = claudeFile(inst.root)
        const out = removeBlock(readText(f) ?? '', inst.packId)
        if (out.trim() === '') j.remove(f)
        else j.write(f, out)
      }
      for (const dd of p.dirs) j.rmdir(join(inst.root, dd))
      // the folders that held only our folders, when empty
      for (const extra of inst.scope === 'global' ? ['skills', 'packs'] : ['.claude/skills', '.claude/packs', '.claude']) {
        const abs = join(inst.root, extra)
        if (isDir(abs) && readdirSync(abs).length === 0) j.rmdir(abs)
      }
      saveState(removeInstall(state, { packId, scope: inst.scope, root: inst.root }))
      prune()
      return { ok: true as const, deleted: p.delete, kept: p.kept, rules: p.rules.action }
    } catch (e) {
      j.rollback()
      throw e
    }
  }

  /** Two versions are kept for an install (current and previous). A copy that belongs to no install and came
   *  from the app itself goes; one the person added stays in the catalog. */
  function prune() {
    const s = loadState().state
    for (const id of names(storeRoot())) {
      const used = s.installs.filter((i) => i.packId === id)
      const keep = new Set(used.flatMap((i) => [i.version, ...(i.previous ? [i.previous] : [])]))
      const vs = storeVersions(id)
      const top = used.length ? used.map((i) => i.version).sort(cmpVersion).at(-1)! : null
      for (const v of vs) {
        const newer = top !== null && cmpVersion(v, top) > 0
        const appOwned = (sourceMeta(id, v)?.origin ?? 'mine') !== 'mine'
        if (keep.has(v) || newer || (used.length === 0 && !appOwned)) continue
        rmSync(storeDir(id, v), { recursive: true, force: true })
        rmSync(join(storeRoot(), id, `${v}.source.json`), { force: true })
      }
      if (storeVersions(id).length === 0) rmSync(join(storeRoot(), id), { recursive: true, force: true })
    }
  }

  // ---- MCP servers per project ---------------------------------------------------------------------
  // A project install keys its switch by server name. A global install has one record for every project, so
  // its switch is keyed `<server>@<project folder>`: on in one project says nothing about another.
  const mcpKey = (inst: PackInstall, server: string, project: string) => (inst.scope === 'global' ? `${server}@${resolve(project)}` : server)

  function installsFor(project: string, state: PackState) {
    const g = resolve(d.claudeDir())
    return state.installs.filter((i) => (i.scope === 'project' && resolve(i.root) === resolve(project)) || (i.scope === 'global' && resolve(i.root) === g))
  }
  function manifestOf(inst: PackInstall): Manifest | null {
    const s = scanSource(storeDir(inst.packId, inst.version))
    return s.ok ? s.manifest : null
  }

  function installed(root: string) {
    const st = loadState()
    return {
      warnings: st.warnings,
      installs: installsFor(root, st.state).map((i) => {
        const m = manifestOf(i)
        return { ...i, servers: (m?.mcp ?? []).map((s) => ({ name: s.name, type: s.type, line: commandLine(s), hosts: m!.hosts, env: s.type === 'stdio' ? s.env : [], enabled: i.mcpEnabled[mcpKey(i, s.name, root)] === true, warning: unpinned(s) })) }
      }),
    }
  }

  /** Turns a pack's server on or off for one project. Nothing starts here; the next panel there injects it. */
  function setMcp(packId: string, root: string, server: string, on: boolean) {
    const state = mustWrite()
    const inst = installsFor(root, state).find((i) => i.packId === packId)
    if (!inst) throw new Error(`${packId} is not installed for ${root}.`)
    const m = manifestOf(inst)
    if (!m?.mcp.some((s) => s.name === server)) throw new Error(`${packId} has no server named ${server}.`)
    const key = mcpKey(inst, server, root)
    const next = { ...inst, mcpEnabled: { ...inst.mcpEnabled, [key]: on } }
    saveState(upsertInstall(state, next))
    return next
  }

  type McpConfig = { type: 'stdio'; command: string; args: string[]; env: Record<string, string> } | { type: 'http' | 'sse'; url: string }
  /** The enabled servers of the packs installed for this folder, keyed `pack-<id>-<server>`, for the panel's
   *  session. Values come from the vault and go only to the server that declared them. Never throws. */
  function mcpFor(project: string): Record<string, McpConfig> {
    const out: Record<string, McpConfig> = {}
    try {
      const st = loadState()
      for (const inst of installsFor(project, st.state)) {
        const m = manifestOf(inst)
        if (!m) continue
        for (const s of m.mcp) {
          if (inst.mcpEnabled[mcpKey(inst, s.name, project)] !== true) continue
          const key = `pack-${inst.packId}-${s.name}`
          if (s.type !== 'stdio') {
            out[key] = { type: s.type, url: s.url }
            continue
          }
          let command = s.command
          if (command.includes('/')) {
            const rel = targetOf(inst.scope, `.claude/packs/${inst.packId}/${command}`)
            // only a file this install wrote, and only inside the root
            if (!inst.files.some((f) => f.to === rel) || !inside(inst.root, rel)) continue
            command = join(inst.root, rel)
          }
          const env: Record<string, string> = {}
          for (const n of s.env) {
            const v = d.vaultGet(n)
            if (v) env[n] = v
          }
          out[key] = { type: 'stdio', command, args: s.args, env }
        }
      }
    } catch {
      return {}
    }
    return out
  }

  /** The enabled pack servers for the registry list: name, origin and what they run, never their env. */
  function registryFor(project: string) {
    const out: { name: string; where: `pack ${string}`; kind: 'stdio' | 'http' | 'sse'; target: string }[] = []
    try {
      for (const inst of installsFor(project, loadState().state)) {
        for (const s of manifestOf(inst)?.mcp ?? []) {
          if (inst.mcpEnabled[mcpKey(inst, s.name, project)] !== true) continue
          out.push({ name: `pack-${inst.packId}-${s.name}`, where: `pack ${inst.packId}`, kind: s.type, target: s.type === 'stdio' ? [s.command, s.args.find((a) => !a.startsWith('-')) ?? ''].join(' ').trim() : s.url.replace(/[?#].*$/, '') })
        }
      }
    } catch {
      // the list is only for display
    }
    return out
  }

  return { list, addFolder, fetchGit, review, install, planUpdate, update, rollback, planRemove, remove, setMcp, installed, mcpFor, registryFor, resolvePack, installsFor, loadState, storeDir, checkRoot, prune }
}

export type Packs = ReturnType<typeof createPacks>

/** CLAUDE.md text without this pack's block. A blank line left behind by the block's own spacing goes too. */
export function removeBlock(text: string, id: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => new RegExp(`^<!-- stm-pack:${id} v\\S+ start -->$`).test(l))
  const end = lines.findIndex((l, i) => i > start && l === `<!-- stm-pack:${id} end -->`)
  if (start < 0 || end < 0) return text
  const out = [...lines.slice(0, start), ...lines.slice(end + 1)]
  // upsert put one blank line before the block; take it with the block
  if (start > 0 && out[start - 1] === '' && (out[start] === '' || out.length === start)) out.splice(start - 1, 1)
  return out.join('\n')
}
