// What each part of the app costs right now: Electron's own process metrics, each one named by what it
// shows (the window, a web app, a preview), plus the Claude Code processes the panels run.
import { execFile } from 'node:child_process'

export type Part = { id: string; kind: 'app' | 'window' | 'webapp' | 'preview' | 'claude' | 'other'; label: string; pids: number[]; memMb: number; cpu: number; app?: string; sid?: string }

export type Metric = { pid: number; type: string; cpu: number; memKb: number }
export type Owner = { pid: number; kind: Part['kind']; label: string; app?: string }
export type Child = { pid: number; ppid: number; rssKb: number; cpu: number; command: string }

/** `ps -A -o pid=,ppid=,rss=,pcpu=,command=` rows. */
export function parsePs(text: string): Child[] {
  return text
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: +m[1]!, ppid: +m[2]!, rssKb: +m[3]!, cpu: +m[4]!, command: m[5]! }))
}

/** Every descendant of `root` in a process table. */
export function descendants(rows: Child[], root: number): Child[] {
  const out: Child[] = []
  const queue = [root]
  while (queue.length) {
    const p = queue.shift()!
    for (const r of rows) if (r.ppid === p) {
      out.push(r)
      queue.push(r.pid)
    }
  }
  return out
}

/**
 * Claude Code processes per working folder. Several panels can share one folder, and a process's folder
 * cannot tell them apart, so they share one row: each process is counted once, never once per panel.
 */
export function claudeByFolder(sessions: { sid: string; cwd: string }[], kids: Child[], cwds: Map<number, string>): { sid: string; label: string; pids: number[]; rssKb: number; cpu: number }[] {
  const out: { sid: string; label: string; pids: number[]; rssKb: number; cpu: number }[] = []
  const seen = new Set<string>()
  for (const s of sessions) {
    if (seen.has(s.cwd)) continue
    seen.add(s.cwd)
    const panels = sessions.filter((x) => x.cwd === s.cwd).length
    const mine = kids.filter((k) => cwds.get(k.pid) === s.cwd)
    if (!mine.length) continue
    const name = s.cwd.split('/').filter(Boolean).slice(-2).join('/')
    out.push({ sid: s.sid, label: `Claude: ${name}${panels > 1 ? ` (${panels} panels)` : ''}`, pids: mine.map((k) => k.pid), rssKb: mine.reduce((n, k) => n + k.rssKb, 0), cpu: mine.reduce((n, k) => n + k.cpu, 0) })
  }
  return out
}

/**
 * Electron's processes grouped by what they show; the rest of the app's own processes (GPU, network,
 * the main process) as "SuperTokenMan"; Claude Code processes per panel, matched by working folder.
 */
export function group(metrics: Metric[], owners: Owner[], claude: { sid: string; label: string; pids: number[]; rssKb: number; cpu: number }[]): Part[] {
  const parts = new Map<string, Part>()
  const add = (id: string, base: Omit<Part, 'pids' | 'memMb' | 'cpu' | 'id'>, pid: number, memKb: number, cpu: number) => {
    const p = parts.get(id) ?? { id, ...base, pids: [], memMb: 0, cpu: 0 }
    p.pids.push(pid)
    p.memMb += memKb / 1024
    p.cpu += cpu
    parts.set(id, p)
  }
  for (const m of metrics) {
    const o = owners.find((x) => x.pid === m.pid)
    if (o) add(o.kind === 'webapp' ? `app-${o.app}` : o.kind === 'window' ? 'window' : `${o.kind}-${o.pid}`, { kind: o.kind, label: o.label, app: o.app }, m.pid, m.memKb, m.cpu)
    else add('app', { kind: 'app', label: 'SuperTokenMan (main, GPU, network)' }, m.pid, m.memKb, m.cpu)
  }
  for (const c of claude) parts.set(`claude-${c.sid}`, { id: `claude-${c.sid}`, kind: 'claude', label: c.label, sid: c.sid, pids: c.pids, memMb: c.rssKb / 1024, cpu: c.cpu })
  return [...parts.values()].map((p) => ({ ...p, memMb: Math.round(p.memMb), cpu: Math.round(p.cpu * 10) / 10 })).sort((a, b) => b.memMb - a.memMb)
}

export const ps = () =>
  new Promise<Child[]>((resolve) => execFile('ps', ['-A', '-o', 'pid=,ppid=,rss=,pcpu=,command='], { maxBuffer: 8 * 1024 * 1024, timeout: 5000 }, (_e, out) => resolve(parsePs(out ?? ''))))
