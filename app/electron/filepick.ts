// The in-app file picker's disk side: folder listings, the files of a project (its .gitignore
// respected) and recently changed files in ~/Downloads, ~/Desktop and ~/Documents. Local disk only;
// the window gets plain listings, never a file handle.
import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, sep } from 'node:path'

export interface PickEntry {
  path: string
  name: string
  dir: boolean
  size: number
  mtime: number
}
export type PickError = 'denied' | 'missing' | 'invalid'
export type Listing = { ok: true; entries: PickEntry[]; truncated: boolean } | { ok: false; error: PickError }

export const MAX_LIST = 2000
export const MAX_PROJECT = 5000
export const MAX_RECENT = 50
/** Folders a project listing never walks into, .gitignore or not. */
const SKIP = new Set(['.git', 'node_modules', '.DS_Store'])

/** An absolute, normalized path without NUL bytes, or null. */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p || p.includes('\0') || !isAbsolute(p)) return null
  const n = normalize(p)
  return n.length > 1 ? n.replace(/\/+$/, '') : n
}

const errorOf = (e: unknown): PickError => {
  const code = (e as NodeJS.ErrnoException)?.code
  return code === 'EACCES' || code === 'EPERM' ? 'denied' : code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'denied'
}
const hiddenName = (name: string) => name.startsWith('.')

async function entryOf(path: string, name: string): Promise<PickEntry | null> {
  try {
    const st = await stat(path)
    return { path, name, dir: st.isDirectory(), size: st.isFile() ? st.size : 0, mtime: st.mtimeMs }
  } catch {
    return null
  }
}

/** One folder: folders first, then files, by name. Hidden entries only when asked for. */
export async function listDir(dir: unknown, opts: { hidden?: boolean; max?: number } = {}): Promise<Listing> {
  const root = cleanPath(dir)
  if (!root) return { ok: false, error: 'invalid' }
  const max = opts.max ?? MAX_LIST
  let names: string[]
  try {
    names = await readdir(root)
  } catch (e) {
    return { ok: false, error: errorOf(e) }
  }
  names = names.filter((n) => opts.hidden || !hiddenName(n)).sort((a, b) => a.localeCompare(b))
  const truncated = names.length > max
  const entries = (await Promise.all(names.slice(0, max).map((n) => entryOf(join(root, n), n)))).filter((e): e is PickEntry => !!e)
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
  return { ok: true, entries, truncated }
}

/** A matcher for .gitignore lines (globs with *, ** and ?, a leading / anchors, a trailing / means folders, ! re-includes). */
export function gitignoreMatcher(text: string): (rel: string, dir: boolean) => boolean {
  const rules: { re: RegExp; neg: boolean; dirOnly: boolean }[] = []
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/\s+$/, '')
    if (!line || line.startsWith('#')) continue
    const neg = line.startsWith('!')
    if (neg) line = line.slice(1)
    const dirOnly = line.endsWith('/')
    if (dirOnly) line = line.slice(0, -1)
    const anchored = line.includes('/')
    line = line.replace(/^\//, '')
    let re = ''
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!
      if (c === '*' && line[i + 1] === '*') {
        re += line[i + 2] === '/' ? '(?:.*/)?' : '.*'
        i += line[i + 2] === '/' ? 2 : 1
      } else if (c === '*') re += '[^/]*'
      else if (c === '?') re += '[^/]'
      else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
    rules.push({ re: new RegExp(anchored ? `^${re}$` : `(?:^|/)${re}$`), neg, dirOnly })
  }
  return (rel, dir) => {
    let out = false
    for (const r of rules) if ((!r.dirOnly || dir) && r.re.test(rel)) out = !r.neg
    return out
  }
}

const gitFiles = (root: string, max: number): Promise<string[] | null> =>
  new Promise((resolve) => {
    execFile('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { maxBuffer: 32 * 1024 * 1024, timeout: 5000 }, (err, out) => {
      if (err) return resolve(null)
      resolve(out.split('\0').filter(Boolean).slice(0, max))
    })
  })

/** A bounded walk that honors the .gitignore files it passes, for folders that are not git repositories. */
async function walk(root: string, max: number, hidden: boolean): Promise<string[]> {
  const out: string[] = []
  const queue: { dir: string; ignores: ((rel: string, dir: boolean) => boolean)[]; bases: string[] }[] = [{ dir: root, ignores: [], bases: [] }]
  let visited = 0
  while (queue.length && out.length < max && visited < 4000) {
    const { dir, ignores, bases } = queue.shift()!
    visited++
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    const own = names.includes('.gitignore') ? await readFile(join(dir, '.gitignore'), 'utf8').then(gitignoreMatcher, () => null) : null
    const ig = own ? [...ignores, own] : ignores
    const bs = own ? [...bases, dir] : bases
    for (const name of names.sort()) {
      if (SKIP.has(name) || (!hidden && hiddenName(name))) continue
      const path = join(dir, name)
      const st = await stat(path).catch(() => null)
      if (!st) continue
      const isDir = st.isDirectory()
      if (ig.some((m, i) => m(relative(bs[i]!, path).split(sep).join('/'), isDir))) continue
      if (isDir) queue.push({ dir: path, ignores: ig, bases: bs })
      else if (out.push(relative(root, path).split(sep).join('/')) >= max) break
    }
  }
  return out
}

/** The files of a project folder, as paths relative to it: `git ls-files` in a repository, else a bounded walk. */
export async function projectFiles(dir: unknown, opts: { hidden?: boolean; max?: number; git?: boolean } = {}): Promise<Listing> {
  const root = cleanPath(dir)
  if (!root) return { ok: false, error: 'invalid' }
  const max = opts.max ?? MAX_PROJECT
  try {
    if (!(await stat(root)).isDirectory()) return { ok: false, error: 'missing' }
  } catch (e) {
    return { ok: false, error: errorOf(e) }
  }
  let rels = opts.git === false ? null : await gitFiles(root, max + 1)
  if (rels) rels = rels.filter((r) => !r.split('/').some((seg) => SKIP.has(seg) || (!opts.hidden && hiddenName(seg))))
  rels ??= await walk(root, max + 1, !!opts.hidden)
  const truncated = rels.length > max
  const entries = (await Promise.all(rels.slice(0, max).map((r) => entryOf(join(root, r), r)))).filter((e): e is PickEntry => !!e && !e.dir)
  return { ok: true, entries, truncated }
}

/** Recently changed files: the ones attached before, then the newest in the given folders (one level deep). */
export async function recentFiles(attached: unknown, folders: string[], opts: { hidden?: boolean; max?: number } = {}): Promise<{ entries: PickEntry[]; denied: string[] }> {
  const max = opts.max ?? MAX_RECENT
  const before = (Array.isArray(attached) ? attached : []).map(cleanPath).filter((p): p is string => !!p).slice(0, max)
  const seen = new Set<string>()
  const mine: PickEntry[] = []
  for (const p of before) {
    if (seen.has(p)) continue
    seen.add(p)
    const e = await entryOf(p, p.split('/').pop() ?? p)
    if (e) mine.push(e)
  }
  const denied: string[] = []
  const found: PickEntry[] = []
  for (const f of folders) {
    const l = await listDir(f, { hidden: opts.hidden, max: 500 })
    if (!l.ok) {
      if (l.error === 'denied') denied.push(f)
      continue
    }
    for (const e of l.entries) if (!seen.has(e.path)) found.push(e)
  }
  found.sort((a, b) => b.mtime - a.mtime)
  return { entries: [...mine, ...found].slice(0, max), denied }
}

/** True when `path` is `root` or inside it. */
export const inside = (root: string, path: string) => path === root || path.startsWith(root.endsWith('/') ? root : root + '/')
