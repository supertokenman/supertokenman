// Ask your data (idea from MindsDB's MindsHub, MIT; no code taken): a question in plain words becomes SQL
// you read before it runs, the answer comes back as a number, a chart or a table, and the answers you
// keep form a dashboard that runs them again. Everything here only reads.

const WRITES = /\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|vacuum|reindex|attach|detach|merge|call|copy|lock|set)\b/i

/** Why this SQL cannot run here, or null: one statement, and it only reads. */
export function onlyReads(sql: string): string | null {
  const s = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:[^']|'')*'/g, "''").trim().replace(/;\s*$/, '')
  if (!s) return 'Nothing to run.'
  if (s.includes(';')) return 'One statement at a time.'
  if (!/^(select|with|values|show|explain|pragma\s+table_info)\b/i.test(s)) return 'Only a query that reads (SELECT or WITH) runs here.'
  if (WRITES.test(s.replace(/^explain\b/i, ''))) return 'This query changes data; ask questions only here, and change data from the Database screen.'
  return null
}

export type ChartPick =
  | { kind: 'number'; label: string; value: number }
  | { kind: 'line' | 'bar'; x: number; ys: number[]; time: boolean }
  | { kind: 'table' }

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null)
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2}(:\d{2})?)?/.test(v) && !Number.isNaN(Date.parse(v.length === 7 ? `${v}-01` : v))

/**
 * How to show an answer: one number as a big figure; a date column with numbers as a line over time; a
 * label column with numbers as bars (30 rows at most); anything else as the table.
 */
export function chartOf(columns: string[], rows: unknown[][]): ChartPick {
  if (!rows.length || !columns.length) return { kind: 'table' }
  const numeric = columns.map((_, i) => rows.every((r) => r[i] === null || num(r[i]) !== null) && rows.some((r) => num(r[i]) !== null))
  if (rows.length === 1 && columns.length === 1 && numeric[0]) return { kind: 'number', label: columns[0]!, value: num(rows[0]![0])! }
  const dateCol = columns.findIndex((_, i) => !numeric[i] && rows.every((r) => r[i] === null || isDate(r[i])))
  const labelCol = dateCol >= 0 ? dateCol : columns.findIndex((_, i) => !numeric[i])
  const ys = numeric.map((n, i) => (n && i !== labelCol ? i : -1)).filter((i) => i >= 0).slice(0, 6)
  if (labelCol < 0 || !ys.length) return { kind: 'table' }
  if (dateCol >= 0 && rows.length >= 2) return { kind: 'line', x: dateCol, ys, time: true }
  if (rows.length <= 30) return { kind: 'bar', x: labelCol, ys, time: false }
  return { kind: 'table' }
}

/** The chart's series from the rows, for the picked columns. */
export function seriesOf(columns: string[], rows: unknown[][], p: Extract<ChartPick, { kind: 'line' | 'bar' }>) {
  return p.ys.map((y) => ({
    name: columns[y]!,
    points: rows.map((r) => [p.time ? Date.parse(String(r[p.x]).length === 7 ? `${r[p.x]}-01` : String(r[p.x])) : String(r[p.x] ?? 'NULL'), num(r[y]) ?? 0] as [number | string, number]),
  }))
}

export type BoardItem = { id: string; conn: string; title: string; question: string; sql: string; at: number }
