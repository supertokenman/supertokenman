// Prometheus in the main process: your server's HTTP API (alerts, targets, range and instant queries,
// metric names), with an optional bearer token or user:password from the vault. Reads only.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alertsOf, checkPromql, nlPrompt, promqlOf, seriesOf, stepFor, targetsOf } from '../shared/prom.js'

type Deps = { dir: () => string; secret: (n: string) => string | undefined; ask: (p: string) => Promise<string>; budget: (tokens: number) => string | null }

export function prometheus(d: Deps) {
  const file = () => join(d.dir(), 'prometheus.json')
  const conf = (): { url: string; saved: { name: string; query: string }[] } => {
    try {
      return existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : { url: '', saved: [] }
    } catch {
      return { url: '', saved: [] }
    }
  }
  const write = (c: ReturnType<typeof conf>) => writeFileSync(file(), JSON.stringify(c, null, 1))
  const get = async (path: string) => {
    const base = conf().url
    if (!base) throw new Error('Set your Prometheus address first.')
    const token = d.secret('PROMETHEUS_TOKEN')
    const basic = d.secret('PROMETHEUS_BASIC_AUTH')
    const r = await fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : basic ? { authorization: `Basic ${Buffer.from(basic).toString('base64')}` } : {}, signal: AbortSignal.timeout(30_000) })
    const j = (await r.json().catch(() => ({}))) as { status?: string; error?: string }
    if (!r.ok || j.status === 'error') throw new Error(`Prometheus: ${j.error ?? `HTTP ${r.status}`}`)
    return j
  }
  const instant = async (q: string): Promise<number | null> => {
    const bad = checkPromql(q)
    if (bad) throw new Error(bad)
    const j = (await get(`/api/v1/query?query=${encodeURIComponent(q)}`)) as { data?: { resultType?: string; result?: unknown } }
    const r = j.data?.result
    if (j.data?.resultType === 'scalar') return Number((r as [number, string])[1])
    const first = (r as { value?: [number, string] }[] | undefined)?.[0]?.value
    return first ? Number(first[1]) : null
  }
  return {
    conf,
    setUrl(url: string) {
      const u = url.trim().replace(/\/+$/, '')
      if (u && !/^https?:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(u)) throw new Error('An address like http://127.0.0.1:9090 or https://prometheus.example.com')
      write({ ...conf(), url: u })
      return conf()
    },
    save(name: string, query: string) {
      const c = conf()
      write({ ...c, saved: [{ name: name.trim().slice(0, 60) || 'Query', query }, ...c.saved.filter((x) => x.name !== name)].slice(0, 40) })
      return conf()
    },
    unsave(name: string) {
      const c = conf()
      write({ ...c, saved: c.saved.filter((x) => x.name !== name) })
      return conf()
    },
    alerts: async () => alertsOf(await get('/api/v1/alerts')),
    targets: async () => targetsOf(await get('/api/v1/targets?state=active')),
    async range(q: string, seconds: number) {
      const bad = checkPromql(q)
      if (bad) throw new Error(bad)
      const end = Math.floor(Date.now() / 1000)
      const step = stepFor(seconds)
      return seriesOf(await get(`/api/v1/query_range?query=${encodeURIComponent(q)}&start=${end - seconds}&end=${end}&step=${step}`))
    },
    instant,
    async ask(question: string) {
      const no = d.budget(2000)
      if (no) throw new Error(no)
      const names = ((await get('/api/v1/label/__name__/values').catch(() => ({ data: [] }))) as { data?: string[] }).data ?? []
      return promqlOf(await d.ask(nlPrompt(question, names)))
    },
  }
}
