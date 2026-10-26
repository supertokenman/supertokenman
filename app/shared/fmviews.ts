// Phase 104: the vault as light task lists. Notes are read by their frontmatter; a view filters them
// and shows a table or a board grouped by one field, and moving a card rewrites only that field.

export type Value = string | string[]
export type Note = { file: string; title: string; data: Record<string, Value>; mtime?: number }

/** The frontmatter as plain values: scalars as text, lists as arrays; anything nested stays text. */
export function parseFrontmatter(md: string): { data: Record<string, Value>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!m) return { data: {}, body: md }
  const data: Record<string, Value> = {}
  let key = ''
  for (const line of m[1]!.split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && key) {
      const prev = data[key]
      data[key] = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), unquote(item[1]!)]
      continue
    }
    const kv = /^([A-Za-z_][\w -]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    key = kv[1]!.trim()
    const v = kv[2]!.trim()
    data[key] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map((x) => unquote(x.trim())).filter(Boolean) : unquote(v)
  }
  return { data, body: md.slice(m[0].length) }
}
const unquote = (s: string) => s.replace(/^(["'])(.*)\1$/, '$2')
const quote = (s: string) => (/^[\w./@-][\w ./@:-]*$/.test(s) && !/:\s/.test(s) && !/^(true|false|null|\d+)$/i.test(s) ? s : JSON.stringify(s))

/** The note with one scalar field set (added when missing); every other line stays as it was. */
export function setField(md: string, key: string, value: string): string {
  if (!/^[A-Za-z_][\w-]*$/.test(key)) throw new Error('A field name is letters, digits, - and _.')
  const line = `${key}: ${quote(value)}`
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!m) return `---\n${line}\n---\n${md}`
  const lines = m[1]!.split(/\r?\n/)
  const i = lines.findIndex((l) => new RegExp(`^${key}:`).test(l))
  if (i < 0) lines.push(line)
  else {
    // a list under the key goes with the old value
    let j = i + 1
    while (j < lines.length && /^\s*-\s+/.test(lines[j]!)) j++
    lines.splice(i, j - i, line)
  }
  return `---\n${lines.join('\n')}\n---\n${md.slice(m[0].length)}`
}

export type Where = { key: string; op: '=' | '!=' | 'has' | 'missing'; value?: string }
/** `type=task status!=done has:due tag=work` into conditions; a bare word must appear in the title. */
export function parseQuery(q: string): { where: Where[]; words: string[] } {
  const where: Where[] = []
  const words: string[] = []
  for (const t of q.trim().split(/\s+/).filter(Boolean)) {
    let m: RegExpExecArray | null
    if ((m = /^(has|missing):([\w-]+)$/.exec(t))) where.push({ key: m[2]!, op: m[1] as 'has' | 'missing' })
    else if ((m = /^([\w-]+)(!=|=)(.+)$/.exec(t))) where.push({ key: m[1]!, op: m[2] as '=' | '!=', value: m[3]! })
    else words.push(t.toLowerCase())
  }
  return { where, words }
}

const values = (v: Value | undefined) => (v === undefined || v === '' ? [] : Array.isArray(v) ? v : [v]).map((x) => x.toLowerCase())
export function filter(notes: Note[], q: string): Note[] {
  const { where, words } = parseQuery(q)
  return notes.filter((n) =>
    where.every((w) => {
      const vs = values(n.data[w.key])
      if (w.op === 'has') return vs.length > 0
      if (w.op === 'missing') return vs.length === 0
      const hit = vs.includes(String(w.value).toLowerCase())
      return w.op === '=' ? hit : !hit
    }) && words.every((w) => n.title.toLowerCase().includes(w)),
  )
}

/** Board columns by one field, in the order given first, then the rest by name; notes without it last. */
export function board(notes: Note[], by: string, order: string[] = []): { column: string; notes: Note[] }[] {
  const cols = new Map<string, Note[]>()
  for (const o of order) cols.set(o, [])
  for (const n of notes) {
    const v = n.data[by]
    const k = (Array.isArray(v) ? v[0] : v) || '(none)'
    cols.set(k, [...(cols.get(k) ?? []), n])
  }
  const rest = [...cols.keys()].filter((k) => !order.includes(k) && k !== '(none)').sort()
  return [...order, ...rest, ...(cols.has('(none)') ? ['(none)'] : [])].map((column) => ({ column, notes: cols.get(column) ?? [] }))
}
