// Product analytics on your own PostHog, the parts with no network: the host, ready HogQL questions,
// a check that a query only reads, a result turned into a chart when it has a time or category and a
// number, a flag's rollout in one line, and exception frames matched to the project's files.
// PostHog is MIT outside its ee/ folder; the app only calls its API.

export const HOSTS = { us: 'https://us.posthog.com', eu: 'https://eu.posthog.com' } as const
export type Conn = { host: string; projectId: number | null }

export function checkHost(h: string): string | null {
  return /^https:\/\/[\w.-]+(:\d+)?$/.test(h.replace(/\/+$/, '')) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(h.replace(/\/+$/, '')) ? null : 'The host is like https://us.posthog.com or your own https://posthog.example.com.'
}

export const PRESETS: { id: string; label: string; query: string }[] = [
  { id: 'daily', label: 'Events per day, 14 days', query: "SELECT toDate(timestamp) AS day, count() AS events FROM events WHERE timestamp > now() - INTERVAL 14 DAY GROUP BY day ORDER BY day" },
  { id: 'dau', label: 'Daily active users, 30 days', query: "SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS users FROM events WHERE timestamp > now() - INTERVAL 30 DAY GROUP BY day ORDER BY day" },
  { id: 'top', label: 'Top events, 7 days', query: "SELECT event, count() AS total FROM events WHERE timestamp > now() - INTERVAL 7 DAY GROUP BY event ORDER BY total DESC LIMIT 15" },
  { id: 'pages', label: 'Top pages, 7 days', query: "SELECT properties.$pathname AS page, count() AS views FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 7 DAY GROUP BY page ORDER BY views DESC LIMIT 15" },
  { id: 'errors', label: 'Exceptions, 7 days', query: "SELECT properties.$exception_type AS type, properties.$exception_message AS message, count() AS times, max(timestamp) AS last FROM events WHERE event = '$exception' AND timestamp > now() - INTERVAL 7 DAY GROUP BY type, message ORDER BY times DESC LIMIT 25" },
]

/** HogQL is read-only on PostHog's side; this keeps the app from sending anything but one SELECT. */
export function checkQuery(q: string): string | null {
  const t = q.trim().replace(/;\s*$/, '')
  if (!/^(with|select)\b/i.test(t)) return 'Only SELECT queries run here.'
  if (t.includes(';')) return 'One query at a time.'
  if (/\b(insert|alter|drop|delete|truncate|create|grant|system)\b/i.test(t.replace(/'[^']*'/g, ''))) return 'Only reads run here.'
  return null
}

/** The SQL out of a model's answer: a fenced block, or the answer itself when it is a SELECT. */
export function sqlOf(answer: string): string {
  const m = /```(?:sql|hogql)?\s*\n([\s\S]*?)```/i.exec(answer)
  return (m ? m[1]! : answer).trim().replace(/;\s*$/, '')
}

export const nlPrompt = (question: string, events: string[]) => `Write one HogQL query (PostHog's SQL, ClickHouse functions) that answers the question below. Tables: events (event, timestamp, distinct_id, person_id, properties.<name>), persons (id, properties.<name>). ${events.length ? `Events seen lately: ${events.slice(0, 40).join(', ')}.` : ''}
Rules: one SELECT only, a time limit in WHERE (default the last 30 days), at most 100 rows, short column names. For a series over time, the first column is the day (toDate(timestamp) AS day) and the second the number.
Answer with the query in a \`\`\`sql block and one line saying what it counts.

Question: ${question.slice(0, 1000)}`

export type Result = { columns: string[]; results: unknown[][] }
export type Chart = { kind: 'line' | 'bar'; x: string[]; y: number[]; label: string } | null

/** A chart when the result has a label column and a number column: dates make a line, anything else bars. */
export function chartOf(r: Result): Chart {
  if (r.columns.length < 2 || !r.results.length || r.results.length > 120) return null
  const yi = r.columns.findIndex((_, i) => i > 0 && r.results.every((row) => typeof row[i] === 'number' || (typeof row[i] === 'string' && /^-?\d+(\.\d+)?$/.test(row[i] as string))))
  if (yi < 0) return null
  const x = r.results.map((row) => String(row[0] ?? '(none)'))
  const dates = x.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))
  return { kind: dates ? 'line' : 'bar', x: dates ? x.map((v) => v.slice(0, 10)) : x, y: r.results.map((row) => Number(row[yi])), label: r.columns[yi]! }
}

export type Flag = { id: number; key: string; name?: string; active: boolean; filters?: { groups?: { rollout_percentage?: number | null; properties?: unknown[] }[] } }
/** "On for 25% of users", "On for everyone", "On for 2 groups with conditions", "Off". */
export function rolloutOf(f: Flag): string {
  if (!f.active) return 'Off'
  const g = f.filters?.groups ?? []
  if (!g.length) return 'On, no release conditions'
  if (g.length === 1 && !(g[0]!.properties ?? []).length) {
    const p = g[0]!.rollout_percentage
    return p == null || p === 100 ? 'On for everyone' : `On for ${p}% of users`
  }
  return `On for ${g.length} ${g.length === 1 ? 'group' : 'groups'} with conditions`
}

export type Frame = { file: string; line?: number; fn?: string; inApp: boolean }
/** The frames of a $exception_list (PostHog's error tracking format), innermost first. */
export function framesOf(list: unknown): Frame[] {
  const all = (Array.isArray(list) ? list : []).flatMap((e) => ((e as { stacktrace?: { frames?: Record<string, unknown>[] } }).stacktrace?.frames ?? []))
  return all
    .map((f) => ({ file: String(f.filename ?? f.abs_path ?? ''), ...(f.lineno ? { line: Number(f.lineno) } : {}), ...(f.function ? { fn: String(f.function) } : {}), inApp: f.in_app !== false }))
    .filter((f) => f.file)
    .reverse()
}

/** A frame's file in the project: the longest path ending that matches a project file. */
export function matchFile(frame: string, files: string[]): string | null {
  const parts = frame.replace(/^(webpack|file|https?):\/+[^/]*/, '').split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..')
  for (let n = parts.length; n >= 1; n--) {
    const tail = `/${parts.slice(-n).join('/')}`
    const hits = files.filter((f) => `/${f}`.endsWith(tail))
    if (hits.length === 1) return hits[0]!
    if (hits.length > 1 && n === parts.length) return hits.sort((a, b) => a.length - b.length)[0]!
  }
  return null
}
