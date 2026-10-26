// Phase 99: Office files from a panel through OfficeCLI (Apache-2.0), a separate program the person
// installs. The app finds it on the PATH, never downloads or installs it, and never runs its
// `install` (that writes into every agent's settings). Files stay inside the panel's folder; each one
// built is validated, checked for issues, previewed as a PNG and kept with a receipt. Nothing is sent
// anywhere: attaching or sending a file is still the person's own act.
// Commands as in the OfficeCLI README: create, batch --input --json (atomic), close, validate --json,
// view <file> issues --json, view <file> screenshot -o <png>, --version.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative, resolve } from 'node:path'
import { childEnv } from './codebox.js'

export const RELEASES = 'https://github.com/iOfficeAI/OfficeCLI/releases'
/** Atomic batches by default arrived in 1.0.137, per the README. */
export const MIN_VERSION = '1.0.137'
const KINDS = ['.docx', '.xlsx', '.pptx']

export type Exec = (bin: string, args: string[], o: { cwd: string; timeoutMs: number; env?: Record<string, string> }) => Promise<{ code: number; stdout: string; stderr: string }>
export const exec: Exec = (bin, args, o) =>
  new Promise((done) => {
    execFile(bin, args, { cwd: o.cwd, timeout: o.timeoutMs, env: { ...childEnv(process.env, false), ...o.env }, maxBuffer: 8_000_000 }, (err, stdout, stderr) =>
      done({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 127) : 0, stdout: String(stdout), stderr: String(stderr) }),
    )
  })

const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return true
}

export type Found = { found: boolean; version?: string; ok: boolean; why?: string; releases: string }
export async function detect(bin = 'officecli', run: Exec = exec): Promise<Found> {
  const r = await run(bin, ['--version'], { cwd: tmpdir(), timeoutMs: 10_000 })
  if (r.code !== 0) return { found: false, ok: false, why: 'officecli is not on the PATH.', releases: RELEASES }
  const version = /(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1]
  if (!version) return { found: true, ok: false, why: 'Could not read its version.', releases: RELEASES }
  return { found: true, version, ok: newer(version, MIN_VERSION), why: newer(version, MIN_VERSION) ? undefined : `Version ${version} is older than ${MIN_VERSION}; update it from the releases page.`, releases: RELEASES }
}

/** The file, inside the panel's folder and of a kind OfficeCLI makes; anything else is refused. */
export function placeOf(root: string, file: string): string {
  const abs = resolve(root, String(file ?? ''))
  const rel = relative(resolve(root), abs)
  if (!rel || rel.startsWith('..') || resolve(root, rel) !== abs) throw new Error(`${file} is outside this panel's folder.`)
  if (!KINDS.includes(extname(abs).toLowerCase())) throw new Error('Only .docx, .xlsx and .pptx files.')
  return abs
}

const envelope = (s: string): { success?: boolean; error?: { error?: string; code?: string; suggestion?: string }; warnings?: unknown[] } | null => {
  try {
    const j = JSON.parse(s.trim().split('\n').filter(Boolean).pop() ?? '')
    return j && typeof j === 'object' ? j : null
  } catch {
    return null
  }
}

export type Built = { file: string; rel: string; ok: boolean; error?: string; hash?: string; issues: string[]; valid: boolean | null; png?: string; commands: number; ms: number; at: number }

/** Create (when new), apply the batch atomically, flush, then validate, list issues and take a screenshot. */
export async function build(root: string, file: string, commands: unknown[], o: { bin?: string; run?: Exec } = {}): Promise<Built> {
  const bin = o.bin ?? 'officecli'
  const run = o.run ?? exec
  const t0 = Date.now()
  const abs = placeOf(root, file)
  const rel = relative(resolve(root), abs)
  const base: Built = { file: abs, rel, ok: false, issues: [], valid: null, commands: commands.length, ms: 0, at: t0 }
  const call = (args: string[]) => run(bin, args, { cwd: root, timeoutMs: 60_000 })
  if (!existsSync(abs)) {
    mkdirSync(join(abs, '..'), { recursive: true })
    const c = await call(['create', abs, '--json'])
    if (c.code === 1 || envelope(c.stdout)?.success === false) return { ...base, error: envelope(c.stdout)?.error?.error ?? (c.stderr.trim() || 'create failed'), ms: Date.now() - t0 }
  }
  const tmp = join(tmpdir(), `stm-office-${Date.now().toString(36)}.json`)
  writeFileSync(tmp, JSON.stringify(commands))
  const b = await call(['batch', abs, '--input', tmp, '--json'])
  rmSync(tmp, { force: true })
  const env = envelope(b.stdout)
  // exit 2 can mean "nothing applied": the envelope decides, as the README says
  if (b.code === 1 || env?.success === false || (b.code !== 0 && b.code !== 2)) {
    const e = env?.error
    return { ...base, error: e ? `${e.error ?? e.code}${e.suggestion ? ` (${e.suggestion})` : ''}` : b.stderr.trim() || `batch exited ${b.code}`, ms: Date.now() - t0 }
  }
  await call(['close', abs])
  const v = await call(['validate', abs, '--json'])
  const iss = await call(['view', abs, 'issues', '--json'])
  let issues: string[] = []
  try {
    const j = JSON.parse(iss.stdout || '[]') as unknown
    issues = (Array.isArray(j) ? j : ((j as { issues?: unknown[] }).issues ?? [])).map((x) => (typeof x === 'string' ? x : String((x as { message?: string; text?: string }).message ?? (x as { text?: string }).text ?? JSON.stringify(x)))).slice(0, 50)
  } catch {
    issues = iss.stdout.trim() ? [iss.stdout.trim().slice(0, 300)] : []
  }
  const shots = join(root, '.stm', 'office')
  mkdirSync(shots, { recursive: true })
  const png = join(shots, `${basename(abs)}.png`)
  const s = await call(['view', abs, 'screenshot', '-o', png])
  const hash = existsSync(abs) ? createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16) : undefined
  return { ...base, ok: true, hash, issues, valid: v.code === 0 ? true : envelope(v.stdout)?.success === false || v.code === 1 ? false : null, png: s.code === 0 && existsSync(png) ? png : undefined, ms: Date.now() - t0 }
}

/** Tests point STM_OFFICECLI at a script; it runs with this runtime as Node. */
export const fakeAware: Exec = (bin, args, o) => exec(process.execPath, [bin, ...args], { ...o, env: { ELECTRON_RUN_AS_NODE: '1', ...(process.env.FAKE_OC_PNG ? { FAKE_OC_PNG: process.env.FAKE_OC_PNG } : {}) } })
