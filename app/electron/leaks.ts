// Leaked secrets in the main process: trufflehog (your own install, run as its own program) on a
// project's git history or files. Only masked hints and fingerprints are kept; the found values are
// dropped as soon as the output is read. Live verification runs only when you turn it on.

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { leakArgs, leaksOf, prePushHook, type Leak } from '../shared/leaks.js'

type Scan = { at: number; source: 'git' | 'filesystem'; verified: boolean; leaks: Leak[]; ms: number }
type Store = { scans: Record<string, Scan>; resolved: Record<string, Record<string, { note: string; at: number }>>; verify: boolean }
const hash = (s: string) => createHash('sha256').update(s).digest('hex')

export function leakScanner(dir: () => string) {
  const file = () => join(dir(), 'leak-scans.json')
  const read = (): Store => {
    try {
      return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Store) : { scans: {}, resolved: {}, verify: false }
    } catch {
      return { scans: {}, resolved: {}, verify: false }
    }
  }
  const write = (s: Store) => writeFileSync(file(), JSON.stringify(s))
  const bin = () => [process.env.STM_TRUFFLEHOG, join(homedir(), '.local', 'bin', 'trufflehog'), '/opt/homebrew/bin/trufflehog', '/usr/local/bin/trufflehog', '/usr/bin/trufflehog'].filter((x): x is string => !!x).find((p) => existsSync(p)) ?? null
  const hookFile = (project: string) => join(project, '.git', 'hooks', 'pre-push')
  return {
    state(project: string) {
      const s = read()
      const h = hookFile(project)
      return { trufflehog: bin(), verify: s.verify, git: existsSync(join(project, '.git')), hook: existsSync(h) ? (readFileSync(h, 'utf8').includes('Added by SuperTokenMan') ? 'ours' : 'other') : 'none', scans: (['git', 'filesystem'] as const).map((k) => s.scans[`${project}\u0000${k}`]).filter(Boolean), resolved: s.resolved[project] ?? {} }
    },
    setVerify(on: boolean) {
      write({ ...read(), verify: Boolean(on) })
    },
    scan(project: string, source: 'git' | 'filesystem') {
      return new Promise<Scan>((res, rej) => {
        const b = bin()
        if (!b) return rej(new Error('trufflehog is not installed. On a Mac: brew install trufflehog.'))
        if (source === 'git' && !existsSync(join(project, '.git'))) return rej(new Error('This folder is not a git repository; scan its files instead.'))
        const verify = read().verify
        const t0 = Date.now()
        execFile(b, leakArgs(source, project, verify), { cwd: project, timeout: 20 * 60_000, maxBuffer: 256 * 1024 * 1024 }, (err, out, errOut) => {
          if (err && !out) return rej(new Error((errOut || err.message).trim().split('\n').slice(-2).join(' ').slice(0, 400)))
          // the values are hashed and masked here; `out` goes out of scope with them
          const scan: Scan = { at: Date.now(), source, verified: verify, leaks: leaksOf(out, hash, verify), ms: Date.now() - t0 }
          const s = read()
          write({ ...s, scans: { ...s.scans, [`${project}\u0000${source}`]: scan } })
          res(scan)
        })
      })
    },
    resolve(project: string, fp: string, note: string | null) {
      const s = read()
      const r = { ...(s.resolved[project] ?? {}) }
      if (note?.trim()) r[fp] = { note: note.trim().slice(0, 300), at: Date.now() }
      else delete r[fp]
      write({ ...s, resolved: { ...s.resolved, [project]: r } })
      return r
    },
    /** Installs the pre-push check, never over a hook that is not ours. */
    hook(project: string, on: boolean) {
      const b = bin()
      const h = hookFile(project)
      if (!existsSync(join(project, '.git'))) throw new Error('Not a git repository.')
      const ours = existsSync(h) && readFileSync(h, 'utf8').includes('Added by SuperTokenMan')
      if (existsSync(h) && !ours) throw new Error('This repo already has a pre-push hook; add the check to it by hand.')
      if (on) {
        if (!b) throw new Error('Install trufflehog first.')
        writeFileSync(h, prePushHook(b))
        chmodSync(h, 0o755)
      } else if (ours) writeFileSync(h, '#!/bin/sh\nexit 0\n')
      return this.state(project).hook
    },
  }
}
