// Every project's env files, read on this machine only: which keys each has, which values repeat across
// projects, and which files are exposed (tracked by git, in its history, or not ignored). Values never
// leave the main process: the page gets a masked preview and a short hash to match repeats.
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { findSecrets } from '../shared/secrets.js'

export type EnvKey = { name: string; masked: string; hash: string; kind: string; empty: boolean }
export type EnvFile = { path: string; project: string; template: boolean; mtime: number; keys: EnvKey[]; git: { inRepo: boolean; tracked: boolean; inHistory: boolean; ignored: boolean } }

const ENV = /^(\.env(\..+)?|\.dev\.vars|.+\.env)$/
const TEMPLATE = /\.(example|sample|template|dist|defaults)$/
const SKIP = new Set(['node_modules', '.git', 'Library', 'Applications', '.Trash', 'dist', 'build', '.next', '.cache', 'vendor', 'Pictures', 'Music', 'Movies', '.npm', '.pnpm-store', 'go', '.cargo', '.rustup', 'venv', '.venv'])

/** Env files under the roots, a few levels deep, skipping dependency and system folders. */
export function findEnvFiles(roots: string[], depth = 4): string[] {
  const out = new Set<string>()
  const walk = (dir: string, d: number) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isFile() && ENV.test(e.name)) out.add(join(dir, e.name))
      else if (e.isDirectory() && d < depth && !SKIP.has(e.name) && !(e.name.startsWith('.') && e.name !== '.config')) walk(join(dir, e.name), d + 1)
    }
  }
  for (const r of roots) walk(r, 0)
  return [...out].sort()
}

/** KEY=value lines; quotes stripped, comments and `export` ignored. */
export function parseEnv(text: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2]!.trim()
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '')
    out.push({ name: m[1]!, value: v })
  }
  return out
}

/** A value shown without being shown: its first and last characters, or dots when it is short. */
export function mask(v: string): string {
  if (!v) return ''
  if (v.length <= 10) return '•'.repeat(Math.min(v.length, 6))
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

/** What a value looks like: a known secret format, a URL with a password, or a plain setting. */
export function kindOf(name: string, value: string): string {
  if (!value) return 'empty'
  const f = findSecrets(`${name}=${value}`)[0]
  if (f) return f.kind
  if (/:\/\/[^:\s]+:[^@\s]+@/.test(value)) return 'connection string'
  if (/(SECRET|TOKEN|KEY|PASSWORD|PASS|PRIVATE|CREDENTIAL)/i.test(name) && value.length >= 12) return 'secret'
  return 'setting'
}

const git = (cwd: string, args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => execFile('git', ['-C', cwd, ...args], { timeout: 8000 }, (err, out) => resolve({ ok: !err, out: (out ?? '').trim() })))

async function gitState(path: string) {
  const dir = dirname(path)
  const top = await git(dir, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return { inRepo: false, tracked: false, inHistory: false, ignored: false }
  const [tracked, history, ignored] = await Promise.all([
    git(dir, ['ls-files', '--error-unmatch', basename(path)]),
    // asked from the file's own folder: the top level git prints may be a resolved path (/private/var on
    // macOS) that the scanned path does not start with
    git(dir, ['log', '--all', '--format=%h', '-1', '--', basename(path)]),
    git(dir, ['check-ignore', '-q', basename(path)]),
  ])
  return { inRepo: true, tracked: tracked.ok, inHistory: !!history.out, ignored: ignored.ok }
}

const projectOf = (path: string) => {
  const parts = dirname(path).split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

export async function scan(roots: string[]): Promise<EnvFile[]> {
  const files = findEnvFiles(roots)
  return Promise.all(
    files.map(async (path) => {
      let text = ''
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        text = ''
      }
      const template = TEMPLATE.test(basename(path))
      const keys = parseEnv(text).map((k) => ({
        name: k.name,
        masked: mask(k.value),
        // a short hash to find the same value elsewhere, salted with nothing secret: 10 hex chars cannot be reversed to a key
        hash: k.value ? createHash('sha256').update(k.value).digest('hex').slice(0, 10) : '',
        // a template should hold names only: a real-looking value in one is a leak waiting to be committed
        kind: kindOf(k.name, k.value),
        empty: !k.value,
      }))
      return { path, project: projectOf(path), template, mtime: statSync(path).mtimeMs, keys, git: await gitState(path) }
    }),
  )
}

/** One value read for the vault, never sent to the page. */
export function readValue(path: string, name: string): string | undefined {
  if (!ENV.test(basename(path))) return undefined
  return parseEnv(readFileSync(path, 'utf8')).find((k) => k.name === name)?.value
}
