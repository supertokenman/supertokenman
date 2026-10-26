// Errors and logs on this machine only (phase 78): uncaught errors, failed IPC calls, renderer and
// child process crashes go to a rotating log in the app's folder, with credentials masked. Crash dumps
// stay local (crashReporter with uploads off). Nothing is sent anywhere.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { redact } from '../shared/secrets.js'

export type LogEntry = { at: number; level: 'error' | 'warn' | 'info'; where: string; text: string }

const MAX = 2 * 1024 * 1024
const KEEP = 3

export function errlog(dir: string) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'main.log')
  const recent: LogEntry[] = []
  const rotate = () => {
    try {
      if (!existsSync(file) || statSync(file).size < MAX) return
      rmSync(`${file}.${KEEP}`, { force: true })
      for (let i = KEEP - 1; i >= 1; i--) if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`)
      renameSync(file, `${file}.1`)
    } catch {
      // a log that cannot rotate keeps growing a little; never fail the app for it
    }
  }
  const write = (level: LogEntry['level'], where: string, err: unknown) => {
    const raw = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : typeof err === 'string' ? err : JSON.stringify(err)
    const text = redact(String(raw)).text.slice(0, 8000)
    const e: LogEntry = { at: Date.now(), level, where, text }
    recent.unshift(e)
    recent.length = Math.min(recent.length, 200)
    rotate()
    try {
      appendFileSync(file, `${new Date(e.at).toISOString()} ${level.toUpperCase()} [${where}] ${text.replace(/\n/g, '\n    ')}\n`)
    } catch {
      // the folder is gone or full: the entry stays in memory
    }
    return e
  }
  return {
    file,
    dir,
    error: (where: string, err: unknown) => write('error', where, err),
    warn: (where: string, err: unknown) => write('warn', where, err),
    info: (where: string, msg: string) => write('info', where, msg),
    recent: (n = 50) => recent.slice(0, n),
    tail: (bytes = 20_000) => {
      try {
        const t = readFileSync(file, 'utf8')
        return t.slice(-bytes)
      } catch {
        return ''
      }
    },
  }
}

/** A report to paste into an issue: versions and the last errors, masked again in case. */
export function report(info: Record<string, string>, entries: LogEntry[]): string {
  const head = Object.entries(info).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  const body = entries.map((e) => `### ${new Date(e.at).toISOString()} ${e.level} [${e.where}]\n\`\`\`\n${e.text}\n\`\`\``).join('\n\n')
  return redact(`## SuperTokenMan diagnostics\n\n${head}\n\n## Last errors\n\n${body || 'None.'}\n`).text
}
