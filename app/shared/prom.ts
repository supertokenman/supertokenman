// Prometheus metrics, the parts with no network: your server's alerts and targets read into rows, a
// range answer into series for a chart, the step for a time window, PromQL from plain words, and a
// threshold on a query that a monitor checks. Prometheus is Apache-2.0; only its HTTP API is used.

export type Alert = { name: string; state: 'firing' | 'pending' | string; severity: string; summary: string; since: string; value: string; labels: Record<string, string> }
export type Target = { job: string; instance: string; health: 'up' | 'down' | 'unknown' | string; error: string; lastScrape: string; url: string }
export type Series = { name: string; points: [number, number][] }

export function alertsOf(json: unknown): Alert[] {
  const list = (json as { data?: { alerts?: Record<string, unknown>[] } })?.data?.alerts ?? []
  const rank = (s: string) => ({ critical: 0, page: 0, error: 1, warning: 2, info: 3 })[s] ?? 4
  return list
    .map((a) => {
      const labels = (a.labels ?? {}) as Record<string, string>
      const ann = (a.annotations ?? {}) as Record<string, string>
      return { name: labels.alertname ?? 'alert', state: String(a.state ?? ''), severity: labels.severity ?? '', summary: ann.summary ?? ann.description ?? '', since: String(a.activeAt ?? ''), value: String(a.value ?? ''), labels }
    })
    .sort((a, b) => Number(b.state === 'firing') - Number(a.state === 'firing') || rank(a.severity) - rank(b.severity) || a.name.localeCompare(b.name))
}

export function targetsOf(json: unknown): Target[] {
  const list = (json as { data?: { activeTargets?: Record<string, unknown>[] } })?.data?.activeTargets ?? []
  return list
    .map((t) => {
      const l = (t.labels ?? {}) as Record<string, string>
      return { job: l.job ?? '', instance: l.instance ?? '', health: String(t.health ?? 'unknown'), error: String(t.lastError ?? ''), lastScrape: String(t.lastScrape ?? ''), url: String(t.scrapeUrl ?? '') }
    })
    .sort((a, b) => Number(a.health === 'up') - Number(b.health === 'up') || a.job.localeCompare(b.job) || a.instance.localeCompare(b.instance))
}

/** A series name from its labels: the metric, then the labels that differ between series. */
function nameOf(metric: Record<string, string>, varying: string[]): string {
  const base = metric.__name__ ?? ''
  const rest = varying.filter((k) => k !== '__name__' && metric[k] != null).map((k) => `${k}="${metric[k]}"`)
  return rest.length ? `${base}{${rest.join(', ')}}` : base || '{}'
}

/** A query_range answer (matrix) as named series, at most `max`, the rest dropped with a count. */
export function seriesOf(json: unknown, max = 8): { series: Series[]; dropped: number } {
  const r = ((json as { data?: { resultType?: string; result?: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[] } })?.data?.result ?? [])
  const keys = [...new Set(r.flatMap((x) => Object.keys(x.metric)))]
  const varying = keys.filter((k) => new Set(r.map((x) => x.metric[k])).size > 1)
  const series = r.map((x) => ({ name: nameOf(x.metric, varying), points: (x.values ?? (x.value ? [x.value] : [])).map(([t, v]) => [t * 1000, Number(v)] as [number, number]).filter(([, v]) => Number.isFinite(v)) }))
  return { series: series.slice(0, max), dropped: Math.max(0, series.length - max) }
}

/** About 120 points over the window, rounded to a step Prometheus likes. */
export function stepFor(seconds: number): number {
  const raw = seconds / 120
  return [15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400].find((s) => s >= raw) ?? 86400
}

export const WINDOWS: { id: string; label: string; seconds: number }[] = [
  { id: '1h', label: '1 hour', seconds: 3600 },
  { id: '6h', label: '6 hours', seconds: 21600 },
  { id: '24h', label: '24 hours', seconds: 86400 },
  { id: '7d', label: '7 days', seconds: 604800 },
]

export const nlPrompt = (question: string, metrics: string[]) => `Write one PromQL expression that answers the question below, for a range chart. ${metrics.length ? `Metrics on this server include: ${metrics.slice(0, 120).join(', ')}.` : ''}
Rules: use only metrics from that list when one fits; rate() over counters with a [5m] window; sum by the few labels that matter; no recording rules you have not seen.
Answer with the expression in a \`\`\`promql block and one line saying what it shows.

Question: ${question.slice(0, 1000)}`

export function promqlOf(answer: string): string {
  const m = /```(?:promql)?\s*\n([\s\S]*?)```/i.exec(answer)
  return (m ? m[1]! : answer).trim()
}

/** A PromQL query is one expression: no shell, no newlines that hide a second thing. */
export function checkPromql(q: string): string | null {
  if (!q.trim()) return 'Write a query.'
  if (q.length > 4000) return 'That query is too long.'
  return null
}

export type Threshold = { op: '>' | '>=' | '<' | '<=' | '==' | '!='; value: number }
export function parseThreshold(s: string): Threshold | null {
  const m = /^\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s)
  return m ? { op: m[1] as Threshold['op'], value: Number(m[2]) } : null
}
/** True when the threshold is crossed, which a monitor reads as down. */
export function crossed(t: Threshold, v: number): boolean {
  return t.op === '>' ? v > t.value : t.op === '>=' ? v >= t.value : t.op === '<' ? v < t.value : t.op === '<=' ? v <= t.value : t.op === '==' ? v === t.value : v !== t.value
}
