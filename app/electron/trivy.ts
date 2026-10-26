// The supply-chain scan in the main process: trivy found on this machine and run on a project, an
// image or its infrastructure files, the findings kept per project with the ones you accepted, an SBOM
// saved per scan when asked, and the gate a deploy checks. trivy is your own install; its database
// downloads on first use into the app's cache folder.

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { findingsOf, gate, scanArgs, type Accepted, type Finding, type Kind } from '../shared/trivy.js'

type Scan = { at: number; kind: Kind; target: string; findings: Finding[]; ms: number }
type Store = { scans: Record<string, Scan>; accepted: Record<string, Accepted[]>; gates: Record<string, string> }

export function supplyChain(dir: () => string) {
  const file = () => join(dir(), 'security-scans.json')
  const read = (): Store => {
    try {
      return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Store) : { scans: {}, accepted: {}, gates: {} }
    } catch {
      return { scans: {}, accepted: {}, gates: {} }
    }
  }
  const write = (s: Store) => writeFileSync(file(), JSON.stringify(s))
  const keyOf = (project: string, kind: Kind, target: string) => createHash('sha1').update(`${project}\u0000${kind}\u0000${target}`).digest('hex').slice(0, 16)
  const bin = () => {
    const c = [process.env.STM_TRIVY, join(homedir(), '.local', 'bin', 'trivy'), '/opt/homebrew/bin/trivy', '/usr/local/bin/trivy', '/usr/bin/trivy'].filter((x): x is string => !!x)
    return c.find((p) => existsSync(p)) ?? null
  }
  const run = (args: string[], cwd: string) =>
    new Promise<string>((res, rej) => {
      const b = bin()
      if (!b) return rej(new Error('trivy is not installed. On a Mac: brew install trivy. Elsewhere: see aquasecurity.github.io/trivy.'))
      execFile(b, args, { cwd, timeout: 15 * 60_000, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, TRIVY_CACHE_DIR: join(dir(), 'trivy-cache'), TRIVY_NO_PROGRESS: 'true' } }, (err, out, errOut) => (err && !out ? rej(new Error((errOut || err.message).trim().split('\n').slice(-3).join(' ').slice(0, 500))) : res(out)))
    })
  return {
    installed: () => bin(),
    async scan(project: string, kind: Kind, target: string) {
      const t0 = Date.now()
      const out = await run(scanArgs(kind, kind === 'image' ? target : project), project)
      const scan: Scan = { at: Date.now(), kind, target: kind === 'image' ? target : project, findings: findingsOf(JSON.parse(out || '{}')), ms: Date.now() - t0 }
      const s = read()
      write({ ...s, scans: { ...s.scans, [keyOf(project, kind, scan.target)]: scan } })
      return scan
    },
    last(project: string) {
      const s = read()
      return (['fs', 'config', 'image'] as Kind[]).flatMap((k) => Object.entries(s.scans).filter(([key, v]) => v.kind === k && key === keyOf(project, k, v.target) && (k === 'image' || v.target === project)).map(([, v]) => v)).sort((a, b) => b.at - a.at)
    },
    accepted: (project: string) => read().accepted[project] ?? [],
    accept(project: string, key: string, note: string, days: number) {
      if (!note.trim()) throw new Error('Say why it is accepted.')
      const s = read()
      const list = (s.accepted[project] ?? []).filter((a) => a.key !== key)
      write({ ...s, accepted: { ...s.accepted, [project]: [...list, { key, note: note.trim().slice(0, 300), until: Date.now() + Math.max(1, Math.min(365, days)) * 86_400_000, at: Date.now() }] } })
      return read().accepted[project]
    },
    unaccept(project: string, key: string) {
      const s = read()
      write({ ...s, accepted: { ...s.accepted, [project]: (s.accepted[project] ?? []).filter((a) => a.key !== key) } })
      return read().accepted[project] ?? []
    },
    async sbom(project: string, format: 'cyclonedx' | 'spdx-json') {
      const out = await run(scanArgs('fs', project, format), project)
      const d = join(dir(), 'sboms', basename(project))
      mkdirSync(d, { recursive: true })
      const f = join(d, `${new Date().toISOString().replace(/[:.]/g, '-')}.${format === 'cyclonedx' ? 'cdx' : 'spdx'}.json`)
      writeFileSync(f, out)
      return f
    },
    gates: () => read().gates,
    setGate(appUuid: string, project: string | null) {
      const s = read()
      const g = { ...s.gates }
      if (project) g[appUuid] = project
      else delete g[appUuid]
      write({ ...s, gates: g })
      return g
    },
    /** The check a deploy of a Coolify app makes against the project it is linked to. */
    gateFor(appUuid: string) {
      const project = read().gates[appUuid]
      if (!project) return { ok: true }
      const fs = this.last(project).find((x) => x.kind === 'fs')
      return gate(fs?.findings ?? null, read().accepted[project] ?? [], fs?.at ?? null, Date.now())
    },
  }
}
