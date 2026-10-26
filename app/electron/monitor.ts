// Monitoring in the main process: each monitor checked on its own timer (HTTP with an optional
// keyword or JSON value, or a TCP port), the TLS certificate's expiry read when asked, the beats kept
// per monitor in userData, and a notification when one goes down or comes back. Plus your own
// Netdata agent's alarms and a few numbers, read from its API; nothing of Netdata's UI or code is used.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect as tcpConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { join } from 'node:path'
import { checkMonitor, cleanMonitor, judge, netdataAlarms, netdataLatest, stateOf, statusPage, transition, uptime, type Beat, type Monitor, type Probe, type State } from '../shared/monitors.js'

const KEEP = 3000
type Config = { monitors: Monitor[]; netdata?: string; pageTitle?: string }

export function monitoring(dir: () => string, onChange: (m: Monitor, to: 'down' | 'up', beat: Beat) => void, onBeat: () => void, prom?: (query: string) => Promise<number | null>) {
  const file = () => join(dir(), 'monitors.json')
  const beatsDir = () => join(dir(), 'monitor-beats')
  const read = (): Config => {
    try {
      return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Config) : { monitors: [] }
    } catch {
      return { monitors: [] }
    }
  }
  const write = (c: Config) => writeFileSync(file(), JSON.stringify(c, null, 1))
  const beats = new Map<string, Beat[]>()
  const states = new Map<string, State>()
  const timers = new Map<string, NodeJS.Timeout>()

  const beatsOf = (id: string): Beat[] => {
    if (!beats.has(id)) {
      try {
        beats.set(id, readFileSync(join(beatsDir(), `${id}.jsonl`), 'utf8').split('\n').filter(Boolean).slice(-KEEP).map((l) => JSON.parse(l) as Beat))
      } catch {
        beats.set(id, [])
      }
    }
    return beats.get(id)!
  }

  async function probe(m: Monitor): Promise<Probe> {
    const t0 = performance.now()
    if (m.kind === 'promql') {
      if (!prom) return { ms: 0, error: 'Set up Prometheus first.' }
      try {
        return { ms: performance.now() - t0, value: await prom(m.target) }
      } catch (e) {
        return { ms: performance.now() - t0, error: (e as Error).message.slice(0, 200) }
      }
    }
    if (m.kind === 'tcp') {
      const [host, port] = [m.target.slice(0, m.target.lastIndexOf(':')), Number(m.target.slice(m.target.lastIndexOf(':') + 1))]
      return new Promise((res) => {
        const s = tcpConnect({ host, port, timeout: m.timeoutMs })
        const done = (error?: string) => (s.destroy(), res({ ms: performance.now() - t0, ...(error ? { error } : {}) }))
        s.once('connect', () => done())
        s.once('timeout', () => done('Timed out'))
        s.once('error', (e) => done((e as NodeJS.ErrnoException).code ?? e.message))
      })
    }
    try {
      const r = await fetch(m.target, { signal: AbortSignal.timeout(m.timeoutMs), redirect: 'follow', headers: { 'user-agent': 'supertokenman-monitor' } })
      const body = m.kind === 'http' ? '' : (await r.text()).slice(0, 2_000_000)
      const ms = performance.now() - t0
      return { status: r.status, body, ms, ...(m.certDays && m.target.startsWith('https:') ? { certExpires: await certExpiry(new URL(m.target)) } : {}) }
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } }
      return { ms: performance.now() - t0, error: err.name === 'TimeoutError' ? 'Timed out' : err.cause?.code ?? err.message }
    }
  }

  const certExpiry = (u: URL) =>
    new Promise<number | undefined>((res) => {
      const s = tlsConnect({ host: u.hostname, port: Number(u.port) || 443, servername: u.hostname, timeout: 5000 }, () => {
        const to = s.getPeerCertificate()?.valid_to
        s.end()
        res(to ? Date.parse(to) : undefined)
      })
      s.once('error', () => res(undefined))
      s.once('timeout', () => (s.destroy(), res(undefined)))
    })

  async function runOne(m: Monitor) {
    const b = judge(m, await probe(m), Date.now())
    const list = beatsOf(m.id)
    list.push(b)
    if (list.length > KEEP) list.splice(0, list.length - KEEP)
    try {
      mkdirSync(beatsDir(), { recursive: true })
      appendFileSync(join(beatsDir(), `${m.id}.jsonl`), `${JSON.stringify(b)}\n`)
    } catch {
      // the history is best effort
    }
    const before = states.get(m.id) ?? stateOf(m, list.slice(0, -1), b.at)
    const after = stateOf(m, list, b.at)
    states.set(m.id, after)
    const t = transition(before, after)
    if (t) onChange(m, t, b)
    onBeat()
    return b
  }

  function schedule() {
    for (const t of timers.values()) clearInterval(t)
    timers.clear()
    for (const m of read().monitors) {
      if (m.paused) continue
      // spread the first checks so they do not all go at once
      const first = setTimeout(() => void runOne(m), 2000 + Math.random() * 5000)
      timers.set(`${m.id}:first`, first)
      timers.set(m.id, setInterval(() => void runOne(m), m.everySec * 1000))
    }
  }

  const view = () => {
    const now = Date.now()
    return read().monitors.map((m) => {
      const b = beatsOf(m.id)
      return { monitor: m, state: stateOf(m, b, now), beats: b.slice(-60), day: uptime(b, now - 86_400_000), month: uptime(b, now - 30 * 86_400_000), last: b[b.length - 1] ?? null }
    })
  }

  return {
    start: schedule,
    list: view,
    history: (id: string) => beatsOf(id),
    save(m: Partial<Monitor>) {
      const bad = checkMonitor(m)
      if (bad) throw new Error(bad)
      const c = read()
      const next = cleanMonitor(m)
      write({ ...c, monitors: c.monitors.some((x) => x.id === next.id) ? c.monitors.map((x) => (x.id === next.id ? next : x)) : [...c.monitors, next] })
      states.delete(next.id)
      schedule()
      return view()
    },
    remove(id: string) {
      const c = read()
      write({ ...c, monitors: c.monitors.filter((x) => x.id !== id) })
      beats.delete(id)
      schedule()
      return view()
    },
    async checkNow(id: string) {
      const m = read().monitors.find((x) => x.id === id)
      if (!m) throw new Error('No such monitor.')
      await runOne(m)
      return view()
    },
    statusPage(title: string) {
      const v = view()
      write({ ...read(), pageTitle: title })
      return statusPage(title || 'Status', v.map((x) => ({ name: x.monitor.name, state: x.state, day: x.day.ratio, month: x.month.ratio })), Date.now())
    },
    pageTitle: () => read().pageTitle ?? 'Status',
    netdataUrl: () => read().netdata ?? '',
    setNetdata(url: string) {
      const u = url.trim().replace(/\/+$/, '')
      if (u && !/^https?:\/\//.test(u)) throw new Error('The agent URL must start with http:// or https://.')
      write({ ...read(), netdata: u })
      return u
    },
    /** Your own agent: its host info, raised alarms and the latest CPU, load and RAM points. */
    async netdata() {
      const base = read().netdata
      if (!base) return null
      const get = async (path: string) => {
        const r = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000) })
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
        return r.json()
      }
      const info = (await get('/api/v1/info')) as { version?: string; os_name?: string; os_version?: string; host_labels?: Record<string, string>; mirrored_hosts?: string[] }
      const point = (chart: string) => get(`/api/v1/data?chart=${chart}&after=-1&points=1&format=json`).then(netdataLatest, () => ({}))
      const [alarms, cpu, load, ram] = await Promise.all([get('/api/v1/alarms').then(netdataAlarms), point('system.cpu'), point('system.load'), point('system.ram')])
      return { host: info.mirrored_hosts?.[0] ?? '', version: info.version ?? '', os: [info.os_name, info.os_version].filter(Boolean).join(' '), alarms, cpu, load, ram }
    },
  }
}
