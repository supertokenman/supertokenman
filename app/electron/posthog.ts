// Product analytics in the main process: your PostHog (cloud or self-hosted) through its API with a
// personal API key from the vault. Queries are HogQL reads; a feature flag changes only on an explicit
// call the screen makes after you confirm.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkHost, checkQuery, framesOf, nlPrompt, sqlOf, type Conn, type Flag, type Result } from '../shared/posthog.js'

type Deps = { dir: () => string; key: () => string | undefined; ask: (prompt: string) => Promise<string>; budget: (tokens: number) => string | null }

export function posthog(d: Deps) {
  const file = () => join(d.dir(), 'posthog.json')
  const conn = (): Conn => {
    try {
      return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Conn) : { host: '', projectId: null }
    } catch {
      return { host: '', projectId: null }
    }
  }
  const call = async <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    const c = conn()
    const key = d.key()
    if (!c.host) throw new Error('Set your PostHog host first.')
    if (!key) throw new Error('Put a personal API key from PostHog (Settings, Personal API keys) in the vault as POSTHOG_PERSONAL_API_KEY.')
    const r = await fetch(`${c.host}${path}`, { method: init?.method ?? 'GET', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, ...(init?.body ? { body: JSON.stringify(init.body) } : {}), signal: AbortSignal.timeout(60_000) })
    const text = await r.text()
    if (!r.ok) throw new Error(`PostHog answered ${r.status}: ${(() => { try { return (JSON.parse(text) as { detail?: string }).detail ?? text } catch { return text } })().slice(0, 300)}`)
    return JSON.parse(text) as T
  }
  const pid = () => {
    const p = conn().projectId
    if (p == null) throw new Error('Pick a project first.')
    return p
  }
  const query = async (q: string): Promise<Result> => {
    const bad = checkQuery(q)
    if (bad) throw new Error(bad)
    const r = await call<{ columns?: string[]; results?: unknown[][] }>(`/api/projects/${pid()}/query/`, { method: 'POST', body: { query: { kind: 'HogQLQuery', query: q } } })
    return { columns: r.columns ?? [], results: r.results ?? [] }
  }
  return {
    conn,
    hasKey: () => Boolean(d.key()),
    setConn(c: Conn) {
      const host = c.host.trim().replace(/\/+$/, '')
      const bad = host ? checkHost(host) : null
      if (bad) throw new Error(bad)
      writeFileSync(file(), JSON.stringify({ host, projectId: c.projectId ?? null }))
      return conn()
    },
    projects: async () => (await call<{ results?: { id: number; name: string }[] }>('/api/projects/')).results?.map((p) => ({ id: p.id, name: p.name })) ?? [],
    query,
    flags: async () => (await call<{ results?: Flag[] }>(`/api/projects/${pid()}/feature_flags/?limit=100`)).results ?? [],
    /** Only after the screen's confirm: turn a flag on or off, or set its single rollout percentage. */
    async setFlag(id: number, change: { active?: boolean; rollout?: number }) {
      const body: Record<string, unknown> = {}
      if (change.active != null) body.active = Boolean(change.active)
      if (change.rollout != null) {
        const f = (await call<Flag>(`/api/projects/${pid()}/feature_flags/${id}/`))
        const groups = f.filters?.groups ?? []
        if (groups.length > 1 || (groups[0]?.properties ?? []).length) throw new Error('This flag has conditions; change its rollout in PostHog.')
        body.filters = { ...f.filters, groups: [{ properties: [], rollout_percentage: Math.max(0, Math.min(100, Math.round(change.rollout))) }] }
      }
      return call<Flag>(`/api/projects/${pid()}/feature_flags/${id}/`, { method: 'PATCH', body })
    },
    experiments: async () => (await call<{ results?: { id: number; name: string; feature_flag_key: string; start_date: string | null; end_date: string | null; description?: string }[] }>(`/api/projects/${pid()}/experiments/?limit=50`)).results ?? [],
    /** The latest stack of one exception, by type and message. */
    async stack(type: string, message: string) {
      const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const r = await query(`SELECT properties.$exception_list FROM events WHERE event = '$exception' AND properties.$exception_type = '${esc(type)}' AND properties.$exception_message = '${esc(message)}' AND timestamp > now() - INTERVAL 30 DAY ORDER BY timestamp DESC LIMIT 1`)
      const raw = r.results[0]?.[0]
      return framesOf(typeof raw === 'string' ? JSON.parse(raw) : raw)
    },
    /** Plain words to HogQL; the query comes back to be shown, not run. */
    async ask(question: string) {
      const no = d.budget(1500)
      if (no) throw new Error(no)
      const ev = await query("SELECT event FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY count() DESC LIMIT 40").catch(() => ({ columns: [], results: [] }))
      return sqlOf(await d.ask(nlPrompt(question, ev.results.map((r) => String(r[0])))))
    },
  }
}
