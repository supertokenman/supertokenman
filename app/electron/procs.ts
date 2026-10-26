// Processes listening on TCP ports, from lsof and ps: what holds a port, where it runs, and a way to stop it.
import { execFile } from 'node:child_process'

export type Listener = { pid: number; name: string; port: number; host: string; command: string; cwd: string; cpu: number; memMb: number; uptime: string; mine: boolean }

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve) => execFile(cmd, args, { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (_err, out) => resolve(out ?? '')))

/** `lsof -F pcn` output: one entry per pid and port. lsof exits 1 when nothing listens, so output is all that counts. */
export function parseLsof(text: string): { pid: number; name: string; port: number; host: string }[] {
  const out: { pid: number; name: string; port: number; host: string }[] = []
  let pid = 0
  let name = ''
  for (const line of text.split('\n')) {
    const k = line[0]
    const v = line.slice(1)
    if (k === 'p') pid = Number(v)
    else if (k === 'c') name = v
    else if (k === 'n') {
      const m = v.match(/^(.*):(\d+)$/)
      if (!m) continue
      const port = Number(m[2])
      const host = m[1] === '*' ? '*' : m[1]!.replace(/^\[|\]$/g, '')
      // the same port on IPv4 and IPv6 is one row
      if (!out.some((o) => o.pid === pid && o.port === port)) out.push({ pid, name, port, host })
    }
  }
  return out.sort((a, b) => a.port - b.port)
}

/** `ps -o pid=,%cpu=,rss=,etime=,command=` output, by pid. */
export function parsePs(text: string): Map<number, { cpu: number; memMb: number; uptime: string; command: string }> {
  const m = new Map<number, { cpu: number; memMb: number; uptime: string; command: string }>()
  for (const line of text.split('\n')) {
    const r = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/)
    if (r) m.set(Number(r[1]), { cpu: Number(r[2]), memMb: Math.round(Number(r[3]) / 1024), uptime: r[4]!, command: r[5]! })
  }
  return m
}

/** `lsof -d cwd -F pn` output: each pid's working directory. */
export function parseCwd(text: string): Map<number, string> {
  const m = new Map<number, string>()
  let pid = 0
  for (const line of text.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n') m.set(pid, line.slice(1))
  }
  return m
}

/** Everything listening on TCP, with its command line, folder and footprint. */
export async function listeners(): Promise<Listener[]> {
  const ports = parseLsof(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn']))
  if (!ports.length) return []
  const pids = [...new Set(ports.map((p) => p.pid))].join(',')
  const [ps, cwd] = await Promise.all([run('ps', ['-o', 'pid=,%cpu=,rss=,etime=,command=', '-p', pids]), run('lsof', ['-a', '-d', 'cwd', '-p', pids, '-F', 'pn'])])
  const info = parsePs(ps)
  const dirs = parseCwd(cwd)
  return ports.map((p) => {
    const i = info.get(p.pid)
    return { ...p, command: i?.command ?? p.name, cwd: dirs.get(p.pid) ?? '', cpu: i?.cpu ?? 0, memMb: i?.memMb ?? 0, uptime: i?.uptime ?? '', mine: p.pid === process.pid || p.pid === process.ppid }
  })
}

/** Stops a process: SIGTERM, or SIGKILL when forced. Never this app itself. */
export function kill(pid: number, force = false) {
  if (!Number.isInteger(pid) || pid <= 1) throw new Error('Not a process id.')
  if (pid === process.pid || pid === process.ppid) throw new Error('That is this app.')
  process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
}
