// The database viewer's engine, in the main process: Postgres (Supabase, Neon or any) through pg,
// MySQL and MariaDB through mysql2, SQLite through Node's own driver, and Cloudflare D1 through its
// HTTP API. Connection strings can hold {{NAME}}, filled from the vault here, so a password never
// reaches the window. Everything runs read-only unless the person turns writes on for that connection,
// and a connection can go through an SSH tunnel made with the system's own ssh and keys.
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer, connect as netConnect } from 'node:net'
// loaded through require: the test runner's bundler does not know node:sqlite yet
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
// the drivers load on the first connection of their kind, not at start-up
const mysqlLib = () => import('mysql2/promise').then((m) => m.default)
import { onlyReads } from '../shared/askdata.js'
import { addressProblem, tidbPlan, tlsFor } from '../shared/tidb.js'
const pgLib = () => import('pg').then((m) => m.default)

/**
 * TLS for a Postgres connection string, with libpq's meaning of sslmode: verify-ca and verify-full check
 * the server's certificate; require encrypts without checking it, and only when the string says so.
 * Supabase and Neon without an sslmode are verified. No TLS when nothing asks for it.
 */
export function pgSsl(url: string): { rejectUnauthorized: boolean } | undefined {
  const mode = /[?&]sslmode=([a-z-]+)/i.exec(url)?.[1]?.toLowerCase()
  if (mode === 'disable') return undefined
  if (mode === 'verify-ca' || mode === 'verify-full') return { rejectUnauthorized: true }
  if (mode === 'require' || mode === 'prefer' || mode === 'no-verify') return { rejectUnauthorized: false }
  if (/supabase|neon\.tech/i.test(url)) return { rejectUnauthorized: true }
  return undefined
}

/** A certificate the client could not check, told in plain words with the way out. */
export function pgTlsHint(err: unknown): string | null {
  const m = err instanceof Error ? err.message : String(err)
  return /self[- ]signed|unable to (get|verify)|certificate|CERT_/i.test(m)
    ? `The database's TLS certificate could not be verified (${m}). If you trust this network, add sslmode=require to the connection string to encrypt without checking it.`
    : null
}
import { fill, mask } from './apiclient.js'

export type DbKind = 'postgres' | 'sqlite' | 'mysql' | 'd1' | 'tidb'
/** MySQL and TiDB share the driver, the quoting and information_schema. */
const isMy = (k: DbKind) => k === 'mysql' || k === 'tidb'
export type DbConn = { id: string; name: string; kind: DbKind; target: string; writes: boolean; /** user@host[:port] to tunnel through */ ssh?: string }
export type DbTable = { schema: string; name: string; kind: 'table' | 'view'; rows?: number }
export type DbResult = { columns: string[]; rows: unknown[][]; count: number; ms: number; cut: boolean; error?: string; command?: string }
export type DbColumn = { name: string; type: string; nullable: boolean; pk: boolean }
export type DbForeignKey = { from: string; column: string; to: string; toColumn: string }
export type DbSchema = { tables: { name: string; schema: string; columns: DbColumn[] }[]; fks: DbForeignKey[] }
export type PlanNode = { label: string; detail?: string; rows?: number; cost?: number; children: PlanNode[]; warn?: string }

const MAX_ROWS = 500
type Vault = { get: (n: string) => string | undefined; all: () => { value: string }[] }
type Raw = { columns: string[]; rows: unknown[][]; changed?: number; command?: string }

function target(c: DbConn, vault: Vault) {
  const used = new Set<string>()
  const missing = new Set<string>()
  const t = fill(c.target.trim(), vault.get, used, missing)
  if (missing.size) throw new Error(`Not in the vault: ${[...missing].join(', ')}. Add ${missing.size === 1 ? 'it' : 'them'} in Connections, Vault.`)
  return t
}

// an error can carry the connection string (with its password): masked like the API client's answers
const clean = (e: unknown, vault: Vault) => mask(e instanceof Error ? e.message : String(e), vault.all().map((x) => x.value))

/** Values that survive the trip to the window: dates as ISO, bytes as a note, big objects as JSON. */
const cell = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : Buffer.isBuffer(v) || v instanceof Uint8Array ? `<${(v as Uint8Array).length} bytes>` : typeof v === 'bigint' ? v.toString() : v !== null && typeof v === 'object' ? JSON.stringify(v) : v)

/** A statement that changes data or schema; D1 has no read-only session, so these are refused there. */
export const WRITES = /^\s*(?:with\b[\s\S]*?\)\s*)?(?:(?:insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|vacuum|reindex|attach|detach)\b|pragma\s+\w+\s*=)/i

// ---- SSH tunnel: ssh -L through the person's own ssh config and keys ----

const freePort = () =>
  new Promise<number>((ok, fail) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => ok(p))
    })
    s.on('error', fail)
  })
const portOpen = (port: number) =>
  new Promise<boolean>((ok) => {
    const s = netConnect(port, '127.0.0.1')
    s.once('connect', () => (s.destroy(), ok(true)))
    s.once('error', () => ok(false))
  })

/** The database's host and port reached through ssh: the URL rewritten to a local port, and how to close it. */
export async function tunnel(url: string, ssh: string, defaultPort: number): Promise<{ url: string; close: () => void }> {
  const u = new URL(url)
  const local = await freePort()
  const [who, sshPort] = ssh.split(/:(?=\d+$)/)
  const args = ['-N', '-o', 'ExitOnForwardFailure=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-L', `${local}:${u.hostname}:${u.port || defaultPort}`, ...(sshPort ? ['-p', sshPort] : []), who!]
  const child: ChildProcess = spawn('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  child.stderr?.on('data', (d) => (err += String(d)))
  const until = Date.now() + 10_000
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`The SSH tunnel did not open: ${err.trim() || `ssh exited with ${child.exitCode}`}`)
    if (await portOpen(local)) {
      u.hostname = '127.0.0.1'
      u.port = String(local)
      return { url: u.toString(), close: () => child.kill() }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  child.kill()
  throw new Error(`The SSH tunnel through ${who} did not open in 10 seconds.`)
}

async function reach<T>(c: DbConn, vault: Vault, port: number, fn: (url: string) => Promise<T>): Promise<T> {
  const url = target(c, vault)
  if (!c.ssh?.trim()) return fn(url)
  const t = await tunnel(url, c.ssh.trim(), port)
  try {
    return await fn(t.url)
  } finally {
    t.close()
  }
}

// ---- drivers: each runs one statement and gives columns and rows ----

async function runPg(c: DbConn, vault: Vault, sql: string): Promise<Raw> {
  return reach(c, vault, 5432, async (url) => {
    const pg = await pgLib()
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000, statement_timeout: 30_000, query_timeout: 35_000, ssl: pgSsl(url) })
    await client.connect().catch((e: unknown) => { throw new Error(pgTlsHint(e) ?? (e instanceof Error ? e.message : String(e))) })
    try {
      if (!c.writes) await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
      const r = await client.query({ text: sql, rowMode: 'array' })
      const res = Array.isArray(r) ? r[r.length - 1] : r
      const cols = (res.fields ?? []).map((f: { name: string }) => f.name)
      return { columns: cols, rows: (res.rows ?? []) as unknown[][], changed: res.rowCount ?? undefined, command: res.command }
    } finally {
      await client.end().catch(() => undefined)
    }
  })
}

/** A MySQL or TiDB connection; verified TLS where it is needed (TiDB Cloud) or asked for (?ssl=true). */
async function myConnect(c: DbConn, url: string, extra: Record<string, unknown> = {}) {
  if (c.kind === 'tidb') {
    const why = addressProblem(url)
    if (why) throw new Error(why)
  }
  // MySQL gets verified TLS when the string asks for it (?ssl=true), as PlanetScale requires
  const ssl = tlsFor(url)
  const mysql = await mysqlLib()
  return mysql.createConnection({ uri: url, connectTimeout: 8000, multipleStatements: false, ...(ssl ? { ssl } : {}), ...extra })
}

async function runMysql(c: DbConn, vault: Vault, sql: string): Promise<Raw> {
  // TiDB accepts READ ONLY only as a no-op, so for it the app checks the statement itself
  if (c.kind === 'tidb' && !c.writes) {
    const why = onlyReads(sql)
    if (why) throw new Error(why === 'One statement at a time.' || why === 'Nothing to run.' ? why : 'Writes are off for this connection, and TiDB has no read-only session, so only a query that reads runs here (SELECT, WITH, SHOW, EXPLAIN). Turn writes on to change data.')
  }
  return reach(c, vault, c.kind === 'tidb' ? 4000 : 3306, async (url) => {
    const db = await myConnect(c, url, { rowsAsArray: true, dateStrings: true })
    try {
      if (!c.writes && c.kind === 'mysql') await db.query('SET SESSION TRANSACTION READ ONLY')
      const [rows, fields] = await db.query({ sql, timeout: 30_000 })
      if (!Array.isArray(rows)) return { columns: [], rows: [], changed: (rows as { affectedRows?: number }).affectedRows ?? 0, command: 'Done' }
      return { columns: (fields ?? []).map((f) => f.name), rows: rows as unknown as unknown[][] }
    } finally {
      await db.end().catch(() => undefined)
    }
  })
}

function runSqlite(c: DbConn, vault: Vault, sql: string): Raw {
  const db = new DatabaseSync(target(c, vault), { readOnly: !c.writes })
  try {
    const st = db.prepare(sql)
    if (!st.columns().length) {
      const r = st.run()
      return { columns: [], rows: [], changed: Number(r.changes) }
    }
    const cols = st.columns().map((x) => x.name)
    const rows: unknown[][] = []
    for (const row of st.iterate() as Iterable<Record<string, unknown>>) rows.push(cols.map((k) => row[k]))
    return { columns: cols, rows }
  } finally {
    db.close()
  }
}

/** d1://ACCOUNT_ID/DATABASE_ID?token=... : Cloudflare's HTTP API for D1. */
async function runD1(c: DbConn, vault: Vault, sql: string, doFetch: typeof fetch = fetch): Promise<Raw> {
  const u = new URL(target(c, vault))
  const token = u.searchParams.get('token') ?? ''
  const db = u.pathname.replace(/^\//, '')
  if (!u.hostname || !db || !token) throw new Error('A D1 connection reads d1://ACCOUNT_ID/DATABASE_ID?token={{CLOUDFLARE_API_TOKEN}}.')
  if (!c.writes && WRITES.test(sql)) throw new Error('read-only: this connection does not allow writes')
  const base = process.env.STM_D1_API ?? 'https://api.cloudflare.com/client/v4'
  const r = await doFetch(`${base}/accounts/${u.hostname}/d1/database/${db}/raw`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql }) })
  const j = (await r.json()) as { success?: boolean; errors?: { message: string }[]; result?: { results?: { columns?: string[]; rows?: unknown[][] }; meta?: { changes?: number } }[] }
  if (!r.ok || !j.success) throw new Error(j.errors?.map((e) => e.message).join('; ') || `D1 answered ${r.status}`)
  const last = j.result?.[j.result.length - 1]
  return { columns: last?.results?.columns ?? [], rows: last?.results?.rows ?? [], changed: last?.meta?.changes }
}

export async function raw(c: DbConn, sql: string, vault: Vault, doFetch?: typeof fetch): Promise<Raw> {
  if (c.kind === 'sqlite') return runSqlite(c, vault, sql)
  if (isMy(c.kind)) return runMysql(c, vault, sql)
  if (c.kind === 'd1') return runD1(c, vault, sql, doFetch)
  return runPg(c, vault, sql)
}

const qi = (c: DbConn, s: string) => (isMy(c.kind) ? `\`${s.replace(/`/g, '``')}\`` : `"${s.replace(/"/g, '""')}"`)

export async function tables(c: DbConn, vault: Vault, doFetch?: typeof fetch): Promise<DbTable[] | { error: string }> {
  try {
    if (c.kind === 'sqlite' || c.kind === 'd1') {
      const list = await raw(c, "select name, type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' and name not like '_cf_%' order by name", vault, doFetch)
      const out: DbTable[] = []
      for (const [name, type] of list.rows as [string, string][]) {
        let rows: number | undefined
        if (c.kind === 'sqlite' || list.rows.length <= 40)
          try {
            rows = Number((await raw(c, `select count(*) from ${qi(c, name)}`, vault, doFetch)).rows[0]?.[0])
          } catch {
            rows = undefined
          }
        out.push({ schema: 'main', name, kind: type === 'view' ? 'view' : 'table', rows })
      }
      return out
    }
    if (isMy(c.kind)) {
      const r = await raw(c, "select table_schema, table_name, table_type, table_rows from information_schema.tables where table_schema = database() order by table_name limit 1000", vault)
      return (r.rows as [string, string, string, number | null][]).map(([schema, name, type, rows]) => ({ schema, name, kind: /VIEW/.test(type) ? 'view' : 'table', rows: rows === null ? undefined : Number(rows) }))
    }
    const r = await raw(c, `select t.table_schema, t.table_name, t.table_type, s.n_live_tup
        from information_schema.tables t left join pg_stat_user_tables s on s.schemaname = t.table_schema and s.relname = t.table_name
        where t.table_schema not in ('pg_catalog', 'information_schema') order by t.table_schema = 'public' desc, t.table_schema, t.table_name limit 1000`, vault)
    return (r.rows as [string, string, string, string | null][]).map(([schema, name, type, rows]) => ({ schema, name, kind: type === 'VIEW' ? 'view' : 'table', rows: rows === null ? undefined : Number(rows) }))
  } catch (e) {
    return { error: clean(e, vault) }
  }
}

export async function query(c: DbConn, sql: string, vault: Vault, doFetch?: typeof fetch): Promise<DbResult> {
  const t0 = Date.now()
  try {
    const r = await raw(c, sql, vault, doFetch)
    if (!r.columns.length) return { columns: [], rows: [], count: r.changed ?? 0, ms: Date.now() - t0, cut: false, command: r.command && r.command !== 'Done' ? `${r.command}${r.changed != null ? `, ${r.changed} rows` : ''}` : `${r.changed ?? 0} row${r.changed === 1 ? '' : 's'} changed` }
    return { columns: r.columns, rows: r.rows.slice(0, MAX_ROWS).map((row) => row.map(cell)), count: r.rows.length, ms: Date.now() - t0, cut: r.rows.length > MAX_ROWS }
  } catch (e) {
    const msg = clean(e, vault)
    return { columns: [], rows: [], count: 0, ms: Date.now() - t0, cut: false, error: /read.only/i.test(msg) && !/^Writes are off/.test(msg) ? `${msg}. Writes are off for this connection; turn them on to change data.` : msg }
  }
}

/** Every row of a query, up to a cap, for export. */
export async function allRows(c: DbConn, sql: string, vault: Vault, cap = 200_000, doFetch?: typeof fetch): Promise<{ columns: string[]; rows: unknown[][]; cut: boolean }> {
  const r = await raw(c, sql, vault, doFetch)
  return { columns: r.columns, rows: r.rows.slice(0, cap).map((row) => row.map(cell)), cut: r.rows.length > cap }
}

// ---- schema: tables, columns and foreign keys, for autocomplete and the ER diagram ----

export async function schema(c: DbConn, vault: Vault, doFetch?: typeof fetch): Promise<DbSchema> {
  if (c.kind === 'sqlite' || c.kind === 'd1') {
    const names = (await raw(c, "select name from sqlite_master where type in ('table','view') and name not like 'sqlite_%' and name not like '_cf_%' order by name", vault, doFetch)).rows.map((r) => String(r[0]))
    const out: DbSchema = { tables: [], fks: [] }
    for (const n of names.slice(0, 200)) {
      const cols = await raw(c, `select name, type, "notnull", pk from pragma_table_info('${n.replace(/'/g, "''")}')`, vault, doFetch)
      out.tables.push({ name: n, schema: 'main', columns: (cols.rows as [string, string, number, number][]).map(([name, type, nn, pk]) => ({ name, type: type || 'any', nullable: !nn, pk: pk > 0 })) })
      const fks = await raw(c, `select "from", "table", "to" from pragma_foreign_key_list('${n.replace(/'/g, "''")}')`, vault, doFetch)
      for (const [from, to, toCol] of fks.rows as [string, string, string | null][]) out.fks.push({ from: n, column: from, to, toColumn: toCol ?? 'id' })
    }
    return out
  }
  if (isMy(c.kind)) {
    const cols = await raw(c, "select table_name, column_name, data_type, is_nullable, column_key from information_schema.columns where table_schema = database() order by table_name, ordinal_position", vault)
    const fks = await raw(c, "select table_name, column_name, referenced_table_name, referenced_column_name from information_schema.key_column_usage where table_schema = database() and referenced_table_name is not null", vault)
    return group(cols.rows as [string, string, string, string, string][], (r) => ({ table: r[0], schema: '', col: { name: r[1], type: r[2], nullable: r[3] === 'YES', pk: r[4] === 'PRI' } }), (fks.rows as [string, string, string, string][]).map(([from, column, to, toColumn]) => ({ from, column, to, toColumn })))
  }
  const cols = await raw(c, `select c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable,
      exists (select 1 from information_schema.table_constraints tc join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
        where tc.constraint_type = 'PRIMARY KEY' and k.table_schema = c.table_schema and k.table_name = c.table_name and k.column_name = c.column_name) as pk
      from information_schema.columns c where c.table_schema not in ('pg_catalog', 'information_schema') order by c.table_schema, c.table_name, c.ordinal_position limit 5000`, vault)
  const fks = await raw(c, `select kcu.table_name, kcu.column_name, ccu.table_name, ccu.column_name from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'`, vault)
  return group(cols.rows as [string, string, string, string, string, boolean][], (r) => ({ table: r[1], schema: r[0], col: { name: r[2], type: r[3], nullable: r[4] === 'YES', pk: Boolean(r[5]) } }), (fks.rows as [string, string, string, string][]).map(([from, column, to, toColumn]) => ({ from, column, to, toColumn })))
}

function group<T>(rows: T[], f: (r: T) => { table: string; schema: string; col: DbColumn }, fks: DbForeignKey[]): DbSchema {
  const map = new Map<string, { name: string; schema: string; columns: DbColumn[] }>()
  for (const r of rows) {
    const x = f(r)
    const t = map.get(x.table) ?? { name: x.table, schema: x.schema, columns: [] }
    t.columns.push(x.col)
    map.set(x.table, t)
  }
  return { tables: [...map.values()], fks }
}

// ---- EXPLAIN: the plan as a tree, with the steps that read whole tables marked ----

export async function explain(c: DbConn, sql: string, vault: Vault, doFetch?: typeof fetch): Promise<PlanNode[]> {
  const body = sql.trim().replace(/;\s*$/, '')
  if (c.kind === 'sqlite' || c.kind === 'd1') {
    const r = await raw(c, `explain query plan ${body}`, vault, doFetch)
    return sqlitePlan(r.rows as [number, number, number, string][])
  }
  if (c.kind === 'tidb') {
    // a query that only reads is run for real (EXPLAIN ANALYZE: actual rows and time); anything else is only planned
    const r = await raw(c, `explain ${onlyReads(body) ? '' : 'analyze '}${body}`, vault)
    return tidbPlan(r.columns, r.rows)
  }
  if (c.kind === 'mysql') {
    const r = await raw(c, `explain format=json ${body}`, vault)
    return [mysqlPlan(JSON.parse(String(r.rows[0]?.[0] ?? '{}')) as Record<string, unknown>)]
  }
  const r = await raw(c, `explain (format json) ${body}`, vault)
  const j = r.rows[0]?.[0]
  const plan = (typeof j === 'string' ? JSON.parse(j) : j) as { Plan: Record<string, unknown> }[]
  return plan.map((p) => pgPlan(p.Plan))
}

/** SQLite's plan rows (id, parent, notused, detail) as a tree. */
export function sqlitePlan(rows: [number, number, number, string][]): PlanNode[] {
  const nodes = new Map<number, PlanNode>()
  const roots: PlanNode[] = []
  for (const [id, parent, , detail] of rows) {
    const n: PlanNode = { label: detail.split(' ').slice(0, 2).join(' '), detail, children: [], ...(/^SCAN\b(?!.*USING)/.test(detail) ? { warn: 'reads the whole table' } : {}) }
    nodes.set(id, n)
    ;(nodes.get(parent)?.children ?? roots).push(n)
  }
  return roots
}

export function pgPlan(p: Record<string, unknown>): PlanNode {
  const type = String(p['Node Type'] ?? '?')
  const rel = p['Relation Name'] ? ` on ${p['Relation Name']}` : ''
  const rows = Number(p['Plan Rows'] ?? 0)
  return {
    label: `${type}${rel}`,
    detail: [p['Index Name'] ? `index ${p['Index Name']}` : '', p['Filter'] ? `filter ${p['Filter']}` : '', p['Index Cond'] ? `cond ${p['Index Cond']}` : ''].filter(Boolean).join(' · ') || undefined,
    rows,
    cost: Number(p['Total Cost'] ?? 0),
    children: ((p['Plans'] as Record<string, unknown>[] | undefined) ?? []).map(pgPlan),
    ...(type === 'Seq Scan' && rows > 1000 ? { warn: `reads the whole table (about ${rows.toLocaleString('en-US')} rows)` } : {}),
  }
}

function mysqlPlan(j: Record<string, unknown>): PlanNode {
  const q = (j['query_block'] ?? j) as Record<string, unknown>
  const kids: PlanNode[] = []
  const visit = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    const t = (o as Record<string, unknown>)['table'] as Record<string, unknown> | undefined
    if (t) {
      const rows = Number(t['rows_examined_per_scan'] ?? t['rows'] ?? 0)
      kids.push({ label: `${t['access_type'] ?? 'read'} on ${t['table_name']}`, detail: t['key'] ? `key ${t['key']}` : undefined, rows, children: [], ...(t['access_type'] === 'ALL' && rows > 1000 ? { warn: `reads the whole table (about ${rows.toLocaleString('en-US')} rows)` } : {}) })
    }
    for (const v of Object.values(o as Record<string, unknown>)) if (v && typeof v === 'object') visit(v)
  }
  visit(q)
  return { label: 'Query', cost: Number((q['cost_info'] as Record<string, unknown> | undefined)?.['query_cost'] ?? 0), children: kids }
}

// ---- export ----

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (columns: string[], rows: unknown[][]) => [columns.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n'
export const toJson = (columns: string[], rows: unknown[][]) => JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null]))), null, 2)

/** What the local model is given to write SQL: the dialect and the schema, compactly. */
export function sqlPrompt(kind: DbKind, s: DbSchema, ask: string): string {
  const dialect = kind === 'tidb' ? 'TiDB (MySQL compatible; VECTOR columns use VEC_COSINE_DISTANCE)' : kind === 'mysql' ? 'MySQL' : kind === 'postgres' ? 'PostgreSQL' : 'SQLite'
  const tables = s.tables.slice(0, 80).map((t) => `${t.name}(${t.columns.map((c) => `${c.name} ${c.type}${c.pk ? ' pk' : ''}`).join(', ')})`).join('\n')
  const fks = s.fks.slice(0, 120).map((f) => `${f.from}.${f.column} -> ${f.to}.${f.toColumn}`).join('\n')
  return `Write one ${dialect} query for the request, using only these tables and columns. Prefer a SELECT; add LIMIT 100 unless asked for counts. Reply with the SQL only, no explanation, no code fence.\n\nTables:\n${tables}\n${fks ? `\nForeign keys:\n${fks}\n` : ''}\nRequest: ${ask.trim()}`
}

/**
 * The data grid's reviewed statements, all or nothing: one transaction on one connection (Postgres,
 * MySQL, SQLite), or D1's batch. Only on a connection with writes turned on.
 */
export async function apply(c: DbConn, statements: string[], vault: Vault, doFetch: typeof fetch = fetch): Promise<{ ok: true; changed: number; ms: number } | { ok: false; error: string; at: number }> {
  if (!c.writes) return { ok: false, error: 'This connection is read-only. Turn writes on for it first.', at: -1 }
  const t0 = Date.now()
  let at = -1
  let changed = 0
  try {
    if (c.kind === 'sqlite') {
      const db = new DatabaseSync(target(c, vault))
      try {
        db.exec('BEGIN')
        try {
          for (const [i, s] of statements.entries()) {
            at = i
            changed += Number(db.prepare(s).run().changes)
          }
          db.exec('COMMIT')
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }
      } finally {
        db.close()
      }
    } else if (isMy(c.kind)) {
      await reach(c, vault, c.kind === 'tidb' ? 4000 : 3306, async (url) => {
        const db = await myConnect(c, url)
        try {
          await db.beginTransaction()
          try {
            for (const [i, s] of statements.entries()) {
              at = i
              const [r] = await db.query({ sql: s, timeout: 30_000 })
              changed += (r as { affectedRows?: number }).affectedRows ?? 0
            }
            await db.commit()
          } catch (e) {
            await db.rollback().catch(() => undefined)
            throw e
          }
        } finally {
          await db.end().catch(() => undefined)
        }
      })
    } else if (c.kind === 'd1') {
      // D1 runs a batch of statements as one transaction
      const r = await runD1(c, vault, statements.join('\n'), doFetch)
      changed = r.changed ?? 0
    } else {
      await reach(c, vault, 5432, async (url) => {
        const pg = await pgLib()
        const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000, statement_timeout: 30_000, ssl: pgSsl(url) })
        await client.connect().catch((e: unknown) => { throw new Error(pgTlsHint(e) ?? (e instanceof Error ? e.message : String(e))) })
        try {
          await client.query('BEGIN')
          try {
            for (const [i, s] of statements.entries()) {
              at = i
              changed += (await client.query(s)).rowCount ?? 0
            }
            await client.query('COMMIT')
          } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined)
            throw e
          }
        } finally {
          await client.end().catch(() => undefined)
        }
      })
    }
    return { ok: true, changed, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: clean(e, vault), at }
  }
}
