// Path safety for pack files (spec section 4). Pure: symlink facts come in as lstat results from main.
// Paths are posix-style; main converts before calling.

export type PathCheck = { ok: true } | { ok: false; reason: string }

const OK: PathCheck = { ok: true }
const fail = (reason: string): PathCheck => ({ ok: false, reason })

const CONTROL = /[\u0000-\u001f\u007f]/
const DRIVE = /^[A-Za-z]:/
const PACK_ID = /^[a-z0-9][a-z0-9-]{1,47}$/

/** A relative path from a pack or a `to` field: no escapes, no absolute forms, canonical segments. */
export function safeRel(p: string): PathCheck {
  if (p === '') return fail('empty path')
  if (CONTROL.test(p)) return fail('NUL or control character')
  if (p.includes('\\')) return fail('backslash')
  if (p.startsWith('/')) return fail('absolute path')
  if (DRIVE.test(p)) return fail('drive letter')
  if (p.startsWith('~')) return fail('home path')
  for (const seg of p.split('/')) {
    if (seg === '') return fail('empty segment')
    if (seg === '.' || seg === '..') return fail(`'${seg}' segment`)
    if (seg.length > 255) return fail('name longer than 255')
  }
  return OK
}

/** Lexical resolve of `.` and `..`; null when `..` climbs above the start. */
function resolveSegs(path: string): string[] | null {
  const out: string[] = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out
}

/** True when `p` (relative to `root`, or absolute) resolves to a strict descendant of the absolute `root`. */
export function inside(root: string, p: string): boolean {
  if (!root.startsWith('/')) return false
  if (p === '' || CONTROL.test(p) || p.includes('\\') || DRIVE.test(p) || p.startsWith('~')) return false
  const base = resolveSegs(root)
  if (base === null) return false
  const full = resolveSegs(p.startsWith('/') ? p : `${root}/${p}`)
  if (full === null || full.length <= base.length) return false
  return base.every((seg, i) => full[i] === seg)
}

/** A `to` target: must be a safe relative path under the pack's own skill or pack folder. */
export function allowedTarget(packId: string, to: string): PathCheck {
  if (!PACK_ID.test(packId)) return fail('bad pack id')
  const rel = safeRel(to)
  if (!rel.ok) return rel
  if (to === 'CLAUDE.md' || to === '.mcp.json') return fail(`${to} is never a file target`)
  const prefixes = [`.claude/skills/${packId}/`, `.claude/packs/${packId}/`]
  if (!prefixes.some((pre) => to.startsWith(pre) && to.length > pre.length)) {
    return fail('target outside the pack folders')
  }
  return OK
}

/** Rejects when any path in the lstat map is a symlink. Missing entries (null/undefined) are skipped. */
export function rejectSymlinks(lstatMap: Map<string, { isSymbolicLink(): boolean } | null | undefined>): PathCheck {
  const links: string[] = []
  for (const [p, st] of lstatMap) {
    if (st && st.isSymbolicLink()) links.push(p)
  }
  return links.length === 0 ? OK : fail(`symlink: ${links.join(', ')}`)
}
