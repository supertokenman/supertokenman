// Install plan for a pack (pure). Produces ordered ops for the main process to apply, plus conflicts
// that block until the user picks skip or overwrite. Hashes and lstat results are passed in; no I/O here.

import type { Manifest } from './packmanifest.js'
import { allowedTarget, safeRel } from './packpath.js'
import type { PackInstall } from './packstate.js'

export type PlanManifest = Pick<Manifest, 'id' | 'version' | 'files' | 'rules'>
export type PlanFile = PlanManifest['files'][number]
export type FsEntry = { type: 'file' | 'dir' | 'symlink' }
export type InstallRecord = PackInstall
export type PlanState = { installs: InstallRecord[] }
export type Decision = 'skip' | 'overwrite'
export type Conflict = { to: string; reason: 'exists' | 'symlink' | 'not-a-file'; overwritable: boolean }
export type PlanOp =
  | { op: 'mkdir'; path: string }
  | { op: 'write'; to: string; from: string; sha256: string; backup: boolean }
  | { op: 'rulesUpsert'; file: 'CLAUDE.md'; packId: string; version: string; rules: string }
  | { op: 'stateRecord'; record: InstallRecord }
export type PlanOpts = {
  scope: 'project' | 'global'
  root: string
  source: InstallRecord['source']
  /** sha256 of each pack source file, keyed by `from`. */
  hashes: Record<string, string>
  /** sha256 of the rules block as written, or null when the pack has no rules. */
  rulesSha256?: string | null
  now: number
  /** Decisions for conflicts, keyed by `to`. Unresolved conflicts block the plan. */
  decisions?: Record<string, Decision>
  hostsApproved?: string[]
}
export type InstallPlan = { errors: string[]; ops: PlanOp[]; conflicts: Conflict[]; blocked: boolean }

export const RULES_FILE = 'CLAUDE.md'

/** Target path relative to the install root. Global installs root at ~/.claude, so `.claude/` is dropped. */
export function targetOf(scope: 'project' | 'global', to: string): string {
  return scope === 'global' ? to.replace(/^\.claude\//, '') : to
}

/** Every ancestor directory of a relative path, shallowest first, excluding the path itself. */
function ancestorsOf(p: string): string[] {
  const parts = p.split('/')
  const out: string[] = []
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'))
  return out
}

/**
 * Plan an install. `existing` maps paths relative to the root to their lstat type. Files this pack already
 * owns (recorded in state for the same packId and root) are not conflicts. Conflicts reported without a
 * decision set `blocked`; the caller must not apply ops while blocked.
 */
export function planInstall(manifest: PlanManifest, existing: Map<string, FsEntry>, state: PlanState, opts: PlanOpts): InstallPlan {
  const errors: string[] = []
  const conflicts: Conflict[] = []
  const ops: PlanOp[] = []

  const sameRoot = (r: InstallRecord) => r.packId === manifest.id && r.scope === opts.scope && r.root === opts.root
  if (state.installs.some(sameRoot)) errors.push(`pack ${manifest.id} is already installed here; use update`)
  if (errors.length) return { errors, ops, conflicts, blocked: false }

  const writes: { to: string; from: string; sha256: string; backup: boolean }[] = []
  let blocked = false
  const dirs = new Set<string>()
  const seen = new Set<string>()

  for (const f of manifest.files) {
    const safe = safeRel(f.to)
    const allowed = safe.ok ? allowedTarget(manifest.id, f.to) : safe
    if (!allowed.ok) { errors.push(`unsafe target ${f.to}: ${allowed.reason}`); continue }
    const to = targetOf(opts.scope, f.to)
    if (seen.has(to)) { errors.push(`duplicate target ${to}`); continue }
    seen.add(to)
    const sha256 = opts.hashes[f.from]
    if (!sha256) { errors.push(`no hash for ${f.from}`); continue }

    // A symlink on any ancestor or on the target itself is never followed.
    const linkAbove = ancestorsOf(to).find(a => existing.get(a)?.type === 'symlink')
    const entry = existing.get(to)
    let conflict: Conflict | null = null
    if (linkAbove || entry?.type === 'symlink') conflict = { to, reason: 'symlink', overwritable: false }
    else if (entry && entry.type !== 'file') conflict = { to, reason: 'not-a-file', overwritable: false }
    else if (entry) conflict = { to, reason: 'exists', overwritable: true }
    if (!conflict) { writes.push({ to, from: f.from, sha256, backup: false }); continue }
    conflicts.push(conflict)
    const d = opts.decisions?.[to]
    if (d === 'overwrite' && conflict.overwritable) writes.push({ to, from: f.from, sha256, backup: true })
    else if (d !== 'skip') blocked = true
  }

  if (errors.length) return { errors, ops, conflicts, blocked: false }

  // Directories to create, only those not already present as directories.
  for (const w of writes) for (const a of ancestorsOf(w.to)) if (existing.get(a)?.type !== 'dir') dirs.add(a)
  const dirList = [...dirs].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  for (const d of dirList) ops.push({ op: 'mkdir', path: d })
  for (const w of writes) ops.push({ op: 'write', ...w })

  const rulesText = manifest.rules?.text
  if (rulesText) ops.push({ op: 'rulesUpsert', file: RULES_FILE, packId: manifest.id, version: manifest.version, rules: rulesText })

  const record: InstallRecord = {
    packId: manifest.id,
    scope: opts.scope,
    root: opts.root,
    version: manifest.version,
    previous: null,
    source: opts.source,
    installedAt: opts.now,
    files: writes.map(w => ({ to: w.to, sha256: w.sha256 })),
    rulesSha256: rulesText ? (opts.rulesSha256 ?? null) : null,
    mcpEnabled: {},
    hostsApproved: opts.hostsApproved ?? [],
  }
  if (!blocked) ops.push({ op: 'stateRecord', record })

  return { errors, ops, conflicts, blocked }
}

const START = (id: string, version: string) => `<!-- stm-pack:${id} v${version} start -->`
const END = (id: string) => `<!-- stm-pack:${id} end -->`
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Insert or replace this pack's block in CLAUDE.md text. Idempotent: applying the same rules twice gives the
 * same text. A block with a start marker but no end marker is ignored and a fresh block is appended.
 */
export function rulesUpsert(text: string, id: string, version: string, rules: string): string {
  const block = `${START(id, version)}\n${rules.trim()}\n${END(id)}`
  const re = new RegExp(`<!-- stm-pack:${escRe(id)} v[^ ]+ start -->[\\s\\S]*?<!-- stm-pack:${escRe(id)} end -->`)
  if (re.test(text)) return text.replace(re, () => block)
  if (text.length === 0) return block + '\n'
  return text.replace(/\s*$/, '') + '\n\n' + block + '\n'
}
