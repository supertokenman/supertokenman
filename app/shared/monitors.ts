// Monitoring, the parts with no network: what a monitor checks, a check's result judged against it,
// when a run of failures turns into "down" (and back), uptime and response time over a window, the
// incidents, maintenance windows, and a static status page. Netdata's alarms read from your own agent.
// Ideas from uptime-kuma (MIT) and the Netdata agent's API; no code is copied from either.

export type MonitorKind = 'http' | 'keyword' | 'json' | 'tcp' | 'promql'
export type Monitor = {
  id: string
  name: string
  kind: MonitorKind
  /** http, keyword, json: the URL; tcp: host:port */
  target: string
  /** keyword: text the body must contain; json: the expected value at `path` */
  keyword?: string
  /** keyword: up when the keyword is NOT there */
  invert?: boolean
  /** json: a dotted path such as status or data.0.ok */
  path?: string
  /** accepted status codes, such as 200-299 or 200,301 */
  statuses?: string
  everySec: number
  /** failures in a row before it counts as down */
  retries: number
  timeoutMs: number
  /** slower than this counts as degraded, not down */
  slowMs?: number
  /** warn when the TLS certificate expires within this many days */
  certDays?: number
  paused?: boolean
  /** maintenance windows: no alerts while one is on */
  maintenance?: { from: number; to: number; note?: string }[]
}

export type Probe = { status?: number; body?: string; ms: number; error?: string; certExpires?: number; value?: number | null }
export type Beat = { at: number; ok: boolean; ms: number; msg: string; slow?: boolean }
export type State = 'up' | 'down' | 'pending' | 'paused' | 'maintenance'

export function checkMonitor(m: Partial<Monitor>): string | null {
  if (!m.name?.trim()) return 'A monitor needs a name.'
  if (m.kind === 'promql') {
    if (!m.target?.trim()) return 'A PromQL monitor needs a query.'
    if (!/^\s*(>=|<=|==|!=|>|<)\s*-?\d+(\.\d+)?\s*$/.test(m.keyword ?? '')) return 'Write when it is down, such as > 0.9.'
  } else if (m.kind === 'tcp') {
    if (!/^[\w.-]+:\d{1,5}$/.test(m.target ?? '')) return 'Write the target as host:port.'
  } else if (!/^https?:\/\/\S+$/.test(m.target ?? '')) return 'The URL must start with http:// or https://.'
  if (m.kind === 'keyword' && !m.keyword?.trim()) return 'A keyword monitor needs a keyword.'
  if (m.kind === 'json' && !m.path?.trim()) return 'A JSON monitor needs a path.'
  if (m.statuses && !/^[\d,\s-]+$/.test(m.statuses)) return 'Status codes look like 200-299 or 200,301.'
  if ((m.everySec ?? 60) < 20) return 'Check at most every 20 seconds.'
  return null
}

export function cleanMonitor(m: Partial<Monitor>): Monitor {
  return {
    id: m.id || `m${Date.now().toString(36)}`,
    name: String(m.name ?? '').trim().slice(0, 80),
    kind: (['http', 'keyword', 'json', 'tcp', 'promql'] as const).includes(m.kind as MonitorKind) ? (m.kind as MonitorKind) : 'http',
    target: String(m.target ?? '').trim(),
    ...(m.keyword?.trim() ? { keyword: m.keyword.trim() } : {}),
    ...(m.invert ? { invert: true } : {}),
    ...(m.path?.trim() ? { path: m.path.trim() } : {}),
    ...(m.statuses?.trim() ? { statuses: m.statuses.trim() } : {}),
    everySec: Math.max(20, Math.min(86_400, Math.round(Number(m.everySec) || 60))),
    retries: Math.max(0, Math.min(10, Math.round(Number(m.retries) || 0))),
    timeoutMs: Math.max(1000, Math.min(60_000, Math.round(Number(m.timeoutMs) || 10_000))),
    ...(Number(m.slowMs) > 0 ? { slowMs: Math.round(Number(m.slowMs)) } : {}),
    ...(Number(m.certDays) > 0 ? { certDays: Math.round(Number(m.certDays)) } : {}),
    ...(m.paused ? { paused: true } : {}),
    ...(m.maintenance?.length ? { maintenance: m.maintenance.filter((w) => w.to > w.from) } : {}),
  }
}

/** Whether a status code is accepted: "200-299" (the default), "200,301", "200-204,404". */
export function statusOk(spec: string | undefined, code: number): boolean {
  return (spec?.trim() || '200-299').split(',').some((part) => {
    const [a, b] = part.trim().split('-').map(Number)
    return b != null && !Number.isNaN(b) ? code >= a! && code <= b : code === a
  })
}

/** The value at a dotted path, such as data.0.ok. */
export function atPath(v: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((o, k) => (o != null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), v)
}

/** A probe's result judged against the monitor. */
export function judge(m: Monitor, p: Probe, now: number): Beat {
  const base = { at: now, ms: Math.round(p.ms) }
  if (p.error) return { ...base, ok: false, msg: p.error }
  if (m.kind === 'promql') {
    const t = /^\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)/.exec(m.keyword ?? '')
    if (p.value == null) return { ...base, ok: false, msg: 'The query returned nothing' }
    const v = p.value
    const n = Number(t?.[2])
    const bad = !t ? false : t[1] === '>' ? v > n : t[1] === '>=' ? v >= n : t[1] === '<' ? v < n : t[1] === '<=' ? v <= n : t[1] === '==' ? v === n : v !== n
    const shown = Math.round(v * 1000) / 1000
    return { ...base, ok: !bad, msg: bad ? `${shown} ${t![1]} ${n}` : `Value ${shown}` }
  }
  if (m.kind !== 'tcp') {
    if (p.status == null || !statusOk(m.statuses, p.status)) return { ...base, ok: false, msg: `HTTP ${p.status ?? '?'}` }
    if (m.kind === 'keyword') {
      const has = (p.body ?? '').toLowerCase().includes((m.keyword ?? '').toLowerCase())
      if (has === Boolean(m.invert)) return { ...base, ok: false, msg: m.invert ? `"${m.keyword}" is on the page` : `"${m.keyword}" not found` }
    }
    if (m.kind === 'json') {
      let got: unknown
      try {
        got = atPath(JSON.parse(p.body ?? ''), m.path ?? '')
      } catch {
        return { ...base, ok: false, msg: 'Not JSON' }
      }
      if (m.keyword != null && m.keyword !== '' && String(got) !== m.keyword) return { ...base, ok: false, msg: `${m.path} is ${JSON.stringify(got)}, expected ${m.keyword}` }
      if ((m.keyword == null || m.keyword === '') && got === undefined) return { ...base, ok: false, msg: `${m.path} is missing` }
    }
  }
  if (m.certDays && p.certExpires) {
    const days = Math.floor((p.certExpires - now) / 86_400_000)
    if (days < m.certDays) return { ...base, ok: true, slow: true, msg: days < 0 ? 'Certificate expired' : `Certificate expires in ${days} days` }
  }
  if (m.slowMs && p.ms > m.slowMs) return { ...base, ok: true, slow: true, msg: `Slow: ${Math.round(p.ms)} ms` }
  return { ...base, ok: true, msg: m.kind === 'tcp' ? 'Port open' : `HTTP ${p.status}` }
}

export const inMaintenance = (m: Monitor, now: number) => (m.maintenance ?? []).some((w) => now >= w.from && now < w.to)

/**
 * The state after the latest beats (newest last): down only after `retries + 1` failures in a row, up
 * on the first success, so one lost packet does not page you.
 */
export function stateOf(m: Monitor, beats: Beat[], now: number): State {
  if (m.paused) return 'paused'
  if (inMaintenance(m, now)) return 'maintenance'
  if (!beats.length) return 'pending'
  const last = beats[beats.length - 1]!
  if (last.ok) return 'up'
  let fails = 0
  for (let i = beats.length - 1; i >= 0 && !beats[i]!.ok; i--) fails++
  return fails > m.retries ? 'down' : 'pending'
}

/** A change worth a notification: into down, or back up from down. */
export function transition(before: State, after: State): 'down' | 'up' | null {
  if (after === 'down' && before !== 'down') return 'down'
  if (after === 'up' && before === 'down') return 'up'
  return null
}

/** Uptime share and average response time of the beats since `since`. */
export function uptime(beats: Beat[], since: number): { ratio: number | null; avgMs: number | null; count: number } {
  const b = beats.filter((x) => x.at >= since)
  const ok = b.filter((x) => x.ok)
  return { ratio: b.length ? ok.length / b.length : null, avgMs: ok.length ? Math.round(ok.reduce((n, x) => n + x.ms, 0) / ok.length) : null, count: b.length }
}

/** Runs of failed beats as incidents, newest first. */
export function incidents(beats: Beat[]): { from: number; to: number | null; msg: string; beats: number }[] {
  const out: { from: number; to: number | null; msg: string; beats: number }[] = []
  let cur: (typeof out)[number] | null = null
  for (const b of beats) {
    if (!b.ok) {
      if (!cur) out.push((cur = { from: b.at, to: null, msg: b.msg, beats: 0 }))
      cur.beats++
    } else if (cur) {
      cur.to = b.at
      cur = null
    }
  }
  return out.reverse()
}

/** The last `n` beats as bars for the strip, oldest first, padded with empties at the start. */
export const strip = (beats: Beat[], n = 40): (Beat | null)[] => [...Array<null>(Math.max(0, n - beats.length)).fill(null), ...beats.slice(-n)]

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
/** A static status page: names, state, 24 h and 30 d uptime. Targets are never written into it. */
export function statusPage(title: string, rows: { name: string; state: State; day: number | null; month: number | null }[], now: number): string {
  const pct = (r: number | null) => (r == null ? 'n/a' : `${(r * 100).toFixed(2)}%`)
  const word: Record<State, string> = { up: 'Operational', down: 'Down', pending: 'Checking', paused: 'Paused', maintenance: 'Maintenance' }
  const all = rows.every((r) => r.state === 'up' || r.state === 'paused')
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#1d1d1b;background:#f6f4ee}h1{font-size:22px}.all{padding:12px 16px;border:1px solid #ccc;margin:16px 0}.row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #ddd}.s{font-weight:600}.down{color:#b3261e}.up{color:#2e7d32}small{color:#777}
@media(prefers-color-scheme:dark){body{background:#1b1a18;color:#eee}.all{border-color:#444}.row{border-color:#333}}</style>
<h1>${esc(title)}</h1><div class="all">${all ? 'All systems operational' : 'Some systems have problems'}</div>
${rows.map((r) => `<div class="row"><span>${esc(r.name)}</span><span><span class="s ${r.state}">${word[r.state]}</span> <small>24 h ${pct(r.day)}, 30 d ${pct(r.month)}</small></span></div>`).join('\n')}
<p><small>Updated ${new Date(now).toISOString().replace('T', ' ').slice(0, 16)} UTC</small></p>`
}

export type NetdataAlarm = { name: string; chart: string; status: 'WARNING' | 'CRITICAL' | string; value: string; since: number; info: string }
/** The raised alarms from a Netdata agent's /api/v1/alarms answer, worst first. */
export function netdataAlarms(json: unknown): NetdataAlarm[] {
  const alarms = (json as { alarms?: Record<string, Record<string, unknown>> })?.alarms ?? {}
  const rank = (s: string) => (s === 'CRITICAL' ? 0 : s === 'WARNING' ? 1 : 2)
  return Object.values(alarms)
    .filter((a) => a.status === 'WARNING' || a.status === 'CRITICAL')
    .map((a) => ({ name: String(a.name ?? ''), chart: String(a.chart ?? ''), status: String(a.status), value: String(a.value_string ?? a.value ?? ''), since: Number(a.last_status_change ?? 0) * 1000, info: String(a.info ?? '') }))
    .sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name))
}
/** The latest point of a /api/v1/data answer (format=json), as label to value. */
export function netdataLatest(json: unknown): Record<string, number> {
  const j = json as { labels?: string[]; data?: number[][] }
  const row = j?.data?.[0]
  if (!j?.labels || !row) return {}
  return Object.fromEntries(j.labels.slice(1).map((l, i) => [l, Math.round((row[i + 1] ?? 0) * 10) / 10]))
}
