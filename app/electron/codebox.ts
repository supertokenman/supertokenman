// Phase 95: "think in code". The panel runs a short script over a big log or JSON and only what the
// script prints comes back into the conversation. A child process with the panel's folder as its cwd,
// a time limit, an output limit and none of the app's credentials in its environment. It is a process,
// not an OS sandbox: say so wherever it is offered.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { compact, LOSSLESS } from '../shared/compact.js'

export type Lang = 'js' | 'ts' | 'python' | 'sh'
export const LANGS: Lang[] = ['js', 'ts', 'python', 'sh']
export type Run = { stdout: string; stderr: string; exit: number | null; ms: number; timedOut: boolean; truncated: boolean; rawBytes: number }
export type Receipt = { at: number; lang: Lang; hash: string; cwd: string; ms: number; rawBytes: number; deliveredBytes: number; exit: number | null; network: boolean; rawPath?: string; intent?: string }

const KEEP = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'PATHEXT']
const DEAD = 'http://127.0.0.1:9'

/** Only the plain variables a script needs; with the network off, every proxy points at a closed port. */
export function childEnv(base: NodeJS.ProcessEnv, network: boolean): Record<string, string> {
  const env: Record<string, string> = {}
  for (const k of KEEP) if (base[k]) env[k] = base[k]!
  env.PYTHONDONTWRITEBYTECODE = '1'
  if (!network) for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) env[k] = DEAD
  return env
}

const EXT: Record<Lang, string> = { js: 'mjs', ts: 'mts', python: 'py', sh: 'sh' }
function command(lang: Lang, file: string, node: string): { cmd: string; args: string[]; env?: Record<string, string> } {
  if (lang === 'python') return { cmd: process.platform === 'win32' ? 'python' : 'python3', args: ['-I', file] }
  if (lang === 'sh') return { cmd: '/bin/sh', args: [file] }
  // the app's own runtime, as plain Node; type annotations are stripped, nothing else is compiled
  return { cmd: node, args: [...(lang === 'ts' ? ['--experimental-strip-types', '--no-warnings'] : []), file], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

export async function runCode(lang: Lang, code: string, o: { cwd: string; timeoutMs?: number; maxBytes?: number; network?: boolean; env?: NodeJS.ProcessEnv; node?: string }): Promise<Run> {
  const timeoutMs = o.timeoutMs ?? 20_000
  const maxBytes = o.maxBytes ?? 2_000_000
  // made atomically with a random name, so no other program can place it first
  const dir = mkdtempSync(join(tmpdir(), 'stm-code-'))
  const file = join(dir, `run.${EXT[lang]}`)
  writeFileSync(file, code)
  const c = command(lang, file, o.node ?? process.execPath)
  const t0 = Date.now()
  return new Promise((resolve) => {
    const p = spawn(c.cmd, c.args, { cwd: o.cwd, env: { ...childEnv(o.env ?? process.env, Boolean(o.network)), ...c.env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = '', raw = 0, truncated = false, timedOut = false
    const take = (b: Buffer, to: 'out' | 'err') => {
      raw += b.length
      if (raw > maxBytes) {
        if (!truncated) (truncated = true), p.kill('SIGKILL')
        return
      }
      if (to === 'out') out += b.toString('utf8')
      else err += b.toString('utf8')
    }
    p.stdout.on('data', (b: Buffer) => take(b, 'out'))
    p.stderr.on('data', (b: Buffer) => take(b, 'err'))
    const timer = setTimeout(() => ((timedOut = true), p.kill('SIGKILL')), timeoutMs)
    const done = (exit: number | null) => {
      clearTimeout(timer)
      rmSync(dir, { recursive: true, force: true })
      resolve({ stdout: out, stderr: err, exit, ms: Date.now() - t0, timedOut, truncated, rawBytes: raw })
    }
    p.on('error', (e) => ((err += String(e.message)), done(null)))
    p.on('close', (code) => done(code))
  })
}

export const hashOf = (lang: string, code: string) => createHash('sha256').update(`${lang}\n${code}`).digest('hex').slice(0, 12)

/**
 * What goes back to the model: stdout through the lossless compactor; past the limit, the head and the
 * tail with a marker, and the whole output kept in a file in the project the person can open.
 */
export function deliver(r: Run, o: { limit?: number; rawDir?: string; hash: string }): { text: string; rawPath?: string } {
  const limit = o.limit ?? 8_000
  let text = compact(r.stdout, { stages: LOSSLESS }).text
  const notes = [r.timedOut ? 'stopped at the time limit' : '', r.truncated ? 'stopped at the output limit' : '', r.exit ? `exit code ${r.exit}` : ''].filter(Boolean)
  let rawPath: string | undefined
  if (text.length > limit) {
    if (o.rawDir) {
      mkdirSync(o.rawDir, { recursive: true })
      rawPath = join(o.rawDir, `${o.hash}.txt`)
      writeFileSync(rawPath, r.stdout)
    }
    const half = Math.floor(limit / 2)
    text = `${text.slice(0, half)}\n[... ${text.length - limit} characters left out${rawPath ? `; the whole output is in ${rawPath}` : ''} ...]\n${text.slice(-half)}`
  }
  const err = r.stderr.trim() ? `\n[stderr]\n${r.stderr.trim().slice(-2_000)}` : ''
  return { text: `${text}${err}${notes.length ? `\n[${notes.join(', ')}]` : ''}` || '[no output]', rawPath }
}

export const CODE_RULE = 'When a command or file would print a lot (a long log, a large JSON, a page dump), do not read it whole: call mcp__code__run_code with a short js, ts, python or sh script that reads it in the project folder and prints only the answer. The person approves each run. It has no network unless you pass network: true and say why.'

/** The run_code tool for one panel; each run is approved by the person, as any tool outside the safe list. */
export function codeServer(o: { cwd: () => string; onReceipt: (r: Receipt) => void; node?: string }) {
  return createSdkMcpServer({
    name: 'code',
    version: '1.0.0',
    tools: [
      tool(
        'run_code',
        'Runs a short script in the project folder and returns only what it prints (compacted; long output is cut, with the whole of it saved to a file). No credentials in its environment; no network unless network is true. 20 s and 2 MB limits.',
        { lang: z.enum(['js', 'ts', 'python', 'sh']), code: z.string().min(1).max(100_000), intent: z.string().max(300).optional(), network: z.boolean().optional() },
        async ({ lang, code, intent, network }) => {
          const cwd = o.cwd()
          const hash = hashOf(lang, code)
          const r = await runCode(lang, code, { cwd, network, node: o.node })
          const d = deliver(r, { rawDir: join(cwd, '.stm', 'exec'), hash })
          o.onReceipt({ at: Date.now(), lang, hash, cwd, ms: r.ms, rawBytes: r.rawBytes, deliveredBytes: Buffer.byteLength(d.text), exit: r.exit, network: Boolean(network), rawPath: d.rawPath, intent })
          return { content: [{ type: 'text' as const, text: d.text }], ...(r.exit ? { isError: true } : {}) }
        },
      ),
    ],
  })
}

/** Phase 99: the office_build tool, offered only when officecli is installed and new enough. */
export function officeServer(o: { cwd: () => string; onBuilt: (b: import('./office.js').Built) => void; bin?: string; fake?: boolean }) {
  return createSdkMcpServer({
    name: 'office',
    version: '1.0.0',
    tools: [
      tool(
        'office_build',
        'Creates or changes a .docx, .xlsx or .pptx inside the project with OfficeCLI batch commands ([{"command":"set"|"add"|"remove"|"move","path":"/slide[1]/shape[1]","props":{...}}], as in OfficeCLI\'s docs). The batch is atomic: one failing item changes nothing. Returns whether it validated, the issues OfficeCLI found and where its screenshot is. The person approves each run.',
        { file: z.string().min(1).max(300), commands: z.array(z.record(z.string(), z.unknown())).min(1).max(500) },
        async ({ file, commands }) => {
          const { build, fakeAware } = await import('./office.js')
          let b: import('./office.js').Built
          try {
            b = await build(o.cwd(), file, commands, { bin: o.bin, run: o.fake ? fakeAware : undefined })
          } catch (e) {
            return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }], isError: true }
          }
          o.onBuilt(b)
          const text = b.ok
            ? `Built ${b.rel} (${b.commands} commands). Valid: ${b.valid === null ? 'unknown' : b.valid ? 'yes' : 'no'}. Issues: ${b.issues.length ? b.issues.join('; ') : 'none'}.${b.png ? ` Screenshot: ${b.png}` : ''}`
            : `Nothing changed in ${b.rel}: ${b.error}`
          return { content: [{ type: 'text' as const, text }], ...(b.ok ? {} : { isError: true }) }
        },
      ),
    ],
  })
}
export const OFFICE_RULE = 'OfficeCLI is installed: to make or change a Word, Excel or PowerPoint file, call mcp__office__office_build with batch commands. Fix the issues it reports before saying the file is ready. Never send or upload the file; the person does that.'
