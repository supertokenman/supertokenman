// SQL autocomplete from the database's own schema: table names after FROM or JOIN, a table's columns
// after "alias.", and otherwise the columns of the tables the query names, then tables and keywords.

export type SchemaLite = { tables: { name: string; columns: { name: string; type: string }[] }[] }
export type Suggestion = { text: string; kind: 'table' | 'column' | 'keyword'; detail?: string }

const KEYWORDS = ['select', 'from', 'where', 'join', 'left join', 'inner join', 'on', 'group by', 'order by', 'having', 'limit', 'and', 'or', 'not', 'in', 'is null', 'is not null', 'like', 'count(*)', 'distinct', 'as', 'desc', 'asc', 'insert into', 'update', 'set', 'delete from', 'values', 'between', 'case', 'when', 'then', 'else', 'end']
const TABLE_CTX = /\b(?:from|join|into|update|table)\s+$/i

/** The tables a query names, with their aliases: "from orders o join customers as c". */
export function aliases(sql: string, s: SchemaLite): Map<string, string> {
  const names = new Set(s.tables.map((t) => t.name.toLowerCase()))
  const out = new Map<string, string>()
  for (const m of sql.matchAll(/\b(?:from|join|update|into)\s+(?:[\w"`]+\.)?["`]?(\w+)["`]?(?:\s+(?:as\s+)?(\w+))?/gi)) {
    const t = m[1]!.toLowerCase()
    if (!names.has(t)) continue
    out.set(t, t)
    const a = m[2]?.toLowerCase()
    if (a && !/^(where|join|left|right|inner|outer|on|group|order|limit|set|values)$/.test(a)) out.set(a, t)
  }
  return out
}

/** What fits at the cursor: where the word being typed starts, and the suggestions, best first. */
export function suggest(sql: string, cursor: number, s: SchemaLite, max = 8): { start: number; items: Suggestion[] } {
  const before = sql.slice(0, cursor)
  const m = /([\w]+)\.([\w]*)$|([\w]*)$/.exec(before)!
  const table = (name: string) => s.tables.find((t) => t.name.toLowerCase() === name)
  if (m[1] !== undefined) {
    // alias.col: the columns of that table
    const t = table(aliases(sql, s).get(m[1].toLowerCase()) ?? m[1].toLowerCase())
    const typed = (m[2] ?? '').toLowerCase()
    const items = (t?.columns ?? []).filter((c) => c.name.toLowerCase().startsWith(typed)).map((c) => ({ text: c.name, kind: 'column' as const, detail: c.type }))
    return { start: cursor - typed.length, items: items.slice(0, max) }
  }
  const typed = (m[3] ?? '').toLowerCase()
  const start = cursor - typed.length
  const head = before.slice(0, start)
  if (TABLE_CTX.test(head)) return { start, items: s.tables.filter((t) => t.name.toLowerCase().startsWith(typed)).slice(0, max).map((t) => ({ text: t.name, kind: 'table' as const, detail: `${t.columns.length} columns` })) }
  if (!typed) return { start, items: [] }
  const used = new Set(aliases(sql, s).values())
  const cols = s.tables.filter((t) => used.has(t.name.toLowerCase())).flatMap((t) => t.columns.map((c) => ({ text: c.name, kind: 'column' as const, detail: `${t.name} · ${c.type}` })))
  const all: Suggestion[] = [...cols, ...s.tables.map((t) => ({ text: t.name, kind: 'table' as const })), ...KEYWORDS.map((k) => ({ text: k, kind: 'keyword' as const }))]
  const seen = new Set<string>()
  return { start, items: all.filter((x) => x.text.toLowerCase().startsWith(typed) && x.text.toLowerCase() !== typed && !seen.has(x.text) && seen.add(x.text)).slice(0, max) }
}

/** An ER layout: tables in a grid, each box as tall as its columns, so the diagram draws at real size. */
export function erLayout(tables: { name: string; columns: unknown[] }[], width = 200, row = 18, gap = 48, perRow = 0) {
  const cols = perRow || Math.max(1, Math.ceil(Math.sqrt(tables.length)))
  const shown = (t: { columns: unknown[] }) => Math.min(t.columns.length, 12)
  const heights = tables.map((t) => 28 + shown(t) * row + (t.columns.length > 12 ? row : 0) + 6)
  const rowH: number[] = []
  tables.forEach((_, i) => (rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)] ?? 0, heights[i]!)))
  const boxes = tables.map((t, i) => {
    const r = Math.floor(i / cols)
    return { name: t.name, x: (i % cols) * (width + gap) + 10, y: rowH.slice(0, r).reduce((a, b) => a + b + gap, 10), w: width, h: heights[i]!, shown: shown(t) }
  })
  return { boxes, width: cols * (width + gap) + 10 - gap + 10, height: rowH.reduce((a, b) => a + b + gap, 10) - gap + 10 }
}
