// Phase 123: TiDB through the MySQL driver the app already has, with what differs: TLS is required on
// TiDB Cloud, the plan comes as rows (EXPLAIN ANALYZE adds what actually ran), read-only sessions are a
// no-op in TiDB so the app checks the statement itself, and VECTOR columns get a similarity query.

export type Plan = { label: string; detail?: string; rows?: number; cost?: number; children: Plan[]; warn?: string }

/** TiDB Cloud's gateways; a connection there has to use TLS. */
export const isCloud = (host: string) => /(^|\.)tidbcloud\.com$/i.test(host.trim())

/** The TLS options for a TiDB address: verified TLS 1.2+ on TiDB Cloud or when the address asks for it. */
export function tlsFor(url: string): { minVersion: 'TLSv1.2'; rejectUnauthorized: true } | undefined {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return undefined
  }
  const asked = /^(true|1|required|verify[-_]?(ca|full|identity)?)$/i.test(u.searchParams.get('ssl') ?? u.searchParams.get('sslmode') ?? u.searchParams.get('ssl-mode') ?? '')
  return isCloud(u.hostname) || asked ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined
}

/** A reason a TiDB address will not work as typed, before the driver says something vaguer. */
export function addressProblem(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'The address should look like mysql://user:{{TIDB_PASSWORD}}@host:4000/db'
  }
  if (isCloud(u.hostname) && /^(false|0|disabled?)$/i.test(u.searchParams.get('ssl') ?? u.searchParams.get('sslmode') ?? '')) return 'TiDB Cloud only accepts TLS; remove ssl=false from the address.'
  if (isCloud(u.hostname) && !/\./.test(decodeURIComponent(u.username))) return 'TiDB Cloud Serverless user names start with a prefix, like 2abc.root; copy it from the Connect dialog.'
  return null
}

/** EXPLAIN [ANALYZE] rows (id with tree marks, estRows, actRows, task, access object, execution info, operator info) as a tree. */
export function tidbPlan(columns: string[], rows: unknown[][]): Plan[] {
  const col = (name: string) => columns.findIndex((c) => c.toLowerCase() === name.toLowerCase())
  const [iId, iEst, iAct, iTask, iObj, iExec, iOp, iMem] = ['id', 'estRows', 'actRows', 'task', 'access object', 'execution info', 'operator info', 'memory'].map(col)
  const roots: Plan[] = []
  const stack: { depth: number; node: Plan }[] = []
  for (const r of rows) {
    const rawId = String(r[iId!] ?? '')
    const lead = /^[\s│├└─|`-]*/.exec(rawId)![0]
    const depth = Math.round([...lead].length / 2)
    const op = rawId.slice(lead.length).replace(/_\d+$/, '')
    const est = Number(r[iEst!] ?? NaN)
    const act = iAct! >= 0 ? Number(r[iAct!] ?? NaN) : NaN
    const task = String(r[iTask!] ?? '')
    const obj = String(r[iObj!] ?? '')
    const time = iExec! >= 0 ? /(?:^|[\s{,])time:\s*([\d.]+\s*[µm]?s)/.exec(String(r[iExec!] ?? ''))?.[1] : undefined
    const mem = iMem! >= 0 && String(r[iMem!] ?? '') !== 'N/A' ? String(r[iMem!]) : ''
    const rowsN = Number.isFinite(act) ? act : Number.isFinite(est) ? est : undefined
    const node: Plan = {
      label: `${op}${obj ? ` on ${obj.replace(/^table:/, '')}` : ''}`,
      detail: [task, Number.isFinite(act) ? `est ${Math.round(est).toLocaleString('en-US')} · actual ${act.toLocaleString('en-US')}` : '', time ? `time ${time}` : '', mem ? `mem ${mem}` : '', String(r[iOp!] ?? '').slice(0, 160)].filter(Boolean).join(' · ') || undefined,
      ...(rowsN !== undefined ? { rows: rowsN } : {}),
      children: [],
      ...(/TableFullScan/.test(op) && (rowsN ?? 0) > 1000 ? { warn: `reads the whole table (about ${Math.round(rowsN!).toLocaleString('en-US')} rows)` } : {}),
      ...(Number.isFinite(act) && Number.isFinite(est) && est > 0 && (act / est > 10 || est / Math.max(act, 1) > 10) && !/TableFullScan/.test(op) ? { warn: `the estimate was off: ${Math.round(est).toLocaleString('en-US')} expected, ${act.toLocaleString('en-US')} read; ANALYZE TABLE may help` } : {}),
    }
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop()
    ;(stack[stack.length - 1]?.node.children ?? roots).push(node)
    stack.push({ depth, node })
  }
  return roots
}

export type Metric = 'cosine' | 'l2'
const qi = (s: string) => `\`${s.replace(/`/g, '``')}\``
/** A nearest-rows query on a VECTOR column; the vector must be a plain list of numbers. */
export function vectorSql(o: { table: string; column: string; vector: string; k?: number; metric?: Metric; show?: string[] }): string {
  const v = o.vector.trim()
  if (!/^\[\s*-?\d+(\.\d+)?(e-?\d+)?(\s*,\s*-?\d+(\.\d+)?(e-?\d+)?)*\s*\]$/i.test(v)) throw new Error('The vector should look like [0.12, -0.5, 0.33].')
  const fn = o.metric === 'l2' ? 'VEC_L2_DISTANCE' : 'VEC_COSINE_DISTANCE'
  const k = Math.max(1, Math.min(200, Math.round(o.k ?? 10)))
  const cols = o.show?.length ? o.show.map(qi).join(', ') : '*'
  return `SELECT ${cols}, ${fn}(${qi(o.column)}, '${v.replace(/\s+/g, '')}') AS distance\nFROM ${qi(o.table)}\nORDER BY distance\nLIMIT ${k}`
}

/** VECTOR columns in a schema, for the similarity helper. */
export const vectorColumns = (tables: { name: string; columns: { name: string; type: string }[] }[]) => tables.flatMap((t) => t.columns.filter((c) => /^vector/i.test(c.type)).map((c) => ({ table: t.name, column: c.name, others: t.columns.filter((x) => !/^vector/i.test(x.type)).map((x) => x.name).slice(0, 6) })))
