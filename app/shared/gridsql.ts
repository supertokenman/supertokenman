// The data grid's edits as SQL (idea from NocoDB, which moved to the Sustainable Use License, so only the
// idea): a cell changed, a row added or a row removed becomes a statement you read before anything runs.
// Rows are found by their primary key, never by position; a table without one cannot be edited here.

export type Dialect = 'postgres' | 'mysql' | 'sqlite' | 'd1'
export type Edit =
  | { kind: 'update'; key: Record<string, unknown>; set: Record<string, unknown> }
  | { kind: 'insert'; values: Record<string, unknown> }
  | { kind: 'delete'; key: Record<string, unknown> }

export const ident = (d: Dialect, s: string) => (d === 'mysql' ? `\`${s.replace(/`/g, '``')}\`` : `"${s.replace(/"/g, '""')}"`)
const table = (d: Dialect, schema: string, name: string) => (schema && schema !== 'main' && schema !== 'public' ? `${ident(d, schema)}.${ident(d, name)}` : ident(d, name))

/** A value as a SQL literal: NULL, numbers as they are, booleans per dialect, everything else quoted. */
export function literal(d: Dialect, v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'boolean') return d === 'postgres' ? (v ? 'TRUE' : 'FALSE') : v ? '1' : '0'
  const s = String(v)
  return `'${(d === 'mysql' ? s.replace(/\\/g, '\\\\') : s).replace(/'/g, "''")}'`
}

/** What the person typed in a cell, for a column of this type: '' on a nullable column is NULL, numbers are numbers. */
export function parseCell(text: string, type: string, nullable: boolean): unknown {
  if (text === '' && nullable) return null
  if (/^NULL$/i.test(text) && nullable) return null
  if (/int|serial|numeric|decimal|real|double|float/i.test(type) && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(text.trim())) return Number(text)
  if (/^bool/i.test(type) && /^(true|false|t|f|1|0|yes|no)$/i.test(text.trim())) return /^(true|t|1|yes)$/i.test(text.trim())
  return text
}

const where = (d: Dialect, key: Record<string, unknown>) => {
  const k = Object.entries(key)
  if (!k.length) throw new Error('No primary key: rows cannot be told apart.')
  return k.map(([c, v]) => (v === null ? `${ident(d, c)} IS NULL` : `${ident(d, c)} = ${literal(d, v)}`)).join(' AND ')
}

/** The statements for the pending edits, in the order they will run. */
export function toSql(d: Dialect, schema: string, name: string, edits: Edit[]): string[] {
  const t = table(d, schema, name)
  return edits.map((e) => {
    if (e.kind === 'update') {
      const set = Object.entries(e.set)
      if (!set.length) throw new Error('An update with nothing to set.')
      return `UPDATE ${t} SET ${set.map(([c, v]) => `${ident(d, c)} = ${literal(d, v)}`).join(', ')} WHERE ${where(d, e.key)};`
    }
    if (e.kind === 'insert') {
      const cols = Object.entries(e.values).filter(([, v]) => v !== undefined)
      return cols.length ? `INSERT INTO ${t} (${cols.map(([c]) => ident(d, c)).join(', ')}) VALUES (${cols.map(([, v]) => literal(d, v)).join(', ')});` : `INSERT INTO ${t} DEFAULT VALUES;`
    }
    return `DELETE FROM ${t} WHERE ${where(d, e.key)};`
  })
}

/** Pending edits folded: a second change to the same cell replaces the first; editing a new row edits its insert; removing a new row drops it. */
export function addEdit(list: Edit[], e: Edit, isNew?: (key: Record<string, unknown>) => number | null): Edit[] {
  const same = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(a) === JSON.stringify(b)
  if (e.kind === 'update') {
    const i = list.findIndex((x) => x.kind === 'update' && same(x.key, e.key))
    if (i >= 0) return list.map((x, k) => (k === i && x.kind === 'update' ? { ...x, set: { ...x.set, ...e.set } } : x))
  }
  if (e.kind === 'delete') {
    const n = isNew?.(e.key)
    if (n !== null && n !== undefined) return list.filter((_, k) => k !== n)
    return [...list.filter((x) => !(x.kind === 'update' && same(x.key, e.key))), e]
  }
  return [...list, e]
}

// ---- browsing a table: a page, a sort and filters, as one SELECT the person can read ----

export type Op = 'contains' | '=' | '!=' | '>' | '<' | 'null' | 'not null'
export const OPS: Op[] = ['contains', '=', '!=', '>', '<', 'null', 'not null']
export type Filter = { col: string; op: Op; value: string }
export type View = { page: number; size: number; sort?: { col: string; desc: boolean }; filters: Filter[] }
export const firstView = (size = 100): View => ({ page: 0, size, filters: [] })

/** A filter's value as the column wants it: numbers stay numbers so 10 > 9 compares as numbers. */
const val = (d: Dialect, v: string) => (/^-?\d+(\.\d+)?$/.test(v.trim()) ? v.trim() : literal(d, v))
function cond(d: Dialect, f: Filter, known: string[]): string | null {
  if (!known.includes(f.col)) return null
  const c = ident(d, f.col)
  if (f.op === 'null') return `${c} IS NULL`
  if (f.op === 'not null') return `${c} IS NOT NULL`
  if (f.value === '') return null
  if (f.op === 'contains') {
    // the cast lets a number or date column be searched as text; LIKE wildcards in the value are literal
    const text = d === 'mysql' ? `CAST(${c} AS CHAR)` : `CAST(${c} AS TEXT)`
    const pat = literal(d, `%${f.value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)
    return d === 'postgres' ? `${text} ILIKE ${pat} ESCAPE '\\'` : `${text} LIKE ${pat} ESCAPE '\\'`
  }
  return `${c} ${f.op === '!=' ? '<>' : f.op} ${val(d, f.value)}`
}

const whereOf = (d: Dialect, v: View, known: string[]) => {
  const parts = v.filters.map((f) => cond(d, f, known)).filter(Boolean)
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : ''
}

/** The page's SELECT; only known column names reach the SQL, values always as literals. */
export function browseSql(d: Dialect, schema: string, name: string, columns: string[], v: View): string {
  const order = v.sort && columns.includes(v.sort.col) ? ` ORDER BY ${ident(d, v.sort.col)} ${v.sort.desc ? 'DESC' : 'ASC'}` : ''
  const size = Math.max(1, Math.min(1000, Math.round(v.size)))
  return `SELECT * FROM ${table(d, schema, name)}${whereOf(d, v, columns)}${order} LIMIT ${size} OFFSET ${Math.max(0, Math.round(v.page)) * size}`
}
export const countSql = (d: Dialect, schema: string, name: string, columns: string[], v: View) => `SELECT COUNT(*) FROM ${table(d, schema, name)}${whereOf(d, v, columns)}`

/** Tab-separated text (a spreadsheet copy) as rows of cells; a trailing newline adds no row. */
export function parseTsv(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  return lines.map((l) => l.split('\t'))
}

/** How a column's cell is edited: by its type. */
export type Editor = 'text' | 'number' | 'bool' | 'date' | 'datetime' | 'json'
export function editorFor(type: string): Editor {
  const t = type.toLowerCase()
  if (/^bool|^tinyint\(1\)/.test(t)) return 'bool'
  if (/json/.test(t)) return 'json'
  if (/timestamp|datetime/.test(t)) return 'datetime'
  if (/^date$/.test(t)) return 'date'
  if (/int|serial|numeric|decimal|real|double|float/.test(t)) return 'number'
  return 'text'
}

/** A JSON cell must parse before it is kept; the text is stored as written. */
export const jsonProblem = (text: string) => {
  if (!text.trim()) return null
  try {
    JSON.parse(text)
    return null
  } catch (e) {
    return (e as Error).message
  }
}
