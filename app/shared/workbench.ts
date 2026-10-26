// The Workbench, the parts with no network: a prompt library with fields asked before sending and
// versions like personas, the prompts.chat collection (CC0) read from its CSV, a /name typed in a panel
// found in the library, @tag pulling documents from the Documents screen, and filters on the way in.
// Ideas from Open WebUI (its license keeps the branding, so no code is taken).

export type Version = { at: number; body: string; note?: string }
export type Prompt = { id: string; name: string; title: string; body: string; tags: string[]; source?: 'prompts.chat'; at: number; versions?: Version[] }
export type Field = { name: string; default?: string }

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'prompt'

const FIELD = /\{\{\s*([\w ]{1,40}?)\s*(?:\|\s*([^}]*?))?\s*\}\}|\$\{([\w ]{1,40}?)(?::([^}]*))?\}/g
/** The fields of a prompt, in order, once each: {{name}}, {{name | default}}, and prompts.chat's ${name:default}. */
export function fieldsOf(body: string): Field[] {
  const out: Field[] = []
  for (const m of body.matchAll(FIELD)) {
    const name = (m[1] ?? m[3] ?? '').trim()
    const def = (m[2] ?? m[4])?.trim()
    if (name && !out.some((f) => f.name === name)) out.push({ name, ...(def ? { default: def } : {}) })
  }
  return out
}
/** The prompt with its fields filled; an empty field takes its default, or stays as it was. */
export const fill = (body: string, values: Record<string, string>) =>
  body.replace(FIELD, (all, a, ad, b, bd) => {
    const name = String(a ?? b).trim()
    const v = values[name]?.trim()
    return v || (ad ?? bd)?.trim() || all
  })

/** A /name at the start of a message, and what follows it. */
export function slashOf(text: string): { name: string; rest: string } | null {
  const m = /^\/([a-z0-9][a-z0-9-]{0,39})(?:\s+([\s\S]*))?$/.exec(text.trim())
  return m ? { name: m[1]!, rest: (m[2] ?? '').trim() } : null
}
/** The prompt a /name points at, by name or by the start of one when only one matches. */
export function findPrompt(list: Prompt[], name: string): Prompt | null {
  const exact = list.find((p) => p.name === name)
  if (exact) return exact
  const starts = list.filter((p) => p.name.startsWith(name))
  return starts.length === 1 ? starts[0]! : null
}

/** @tags in a message that name a Documents tag, and the message without them. */
export function collectionsOf(text: string, tags: string[]): { tags: string[]; text: string } {
  const known = new Set(tags.map((t) => t.toLowerCase()))
  const found: string[] = []
  const rest = text.replace(/(^|\s)@([\w-]{1,40})\b/g, (all, sp, t) => {
    if (!known.has(t.toLowerCase())) return all
    if (!found.includes(t.toLowerCase())) found.push(t.toLowerCase())
    return sp
  })
  return { tags: found, text: rest.replace(/\s{2,}/g, ' ').trim() }
}

/** Filters on the way in, applied in order; each one is a short, visible rule added to the message. */
export type Filter = 'concise' | 'pt-br' | 'en' | 'plain' | 'cite' | 'no-code'
export const FILTERS: Record<Filter, { label: string; rule: string }> = {
  concise: { label: 'Concise', rule: 'Answer in at most 120 words.' },
  'pt-br': { label: 'Answer in Portuguese', rule: 'Answer in Brazilian Portuguese.' },
  en: { label: 'Answer in English', rule: 'Answer in English.' },
  plain: { label: 'Plain words', rule: 'Use plain words; explain any term of art in one line.' },
  cite: { label: 'Cite sources', rule: 'Name the file, link or document for each claim you take from somewhere.' },
  'no-code': { label: 'No code', rule: 'Do not write code; describe the change instead.' },
}
export function applyFilters(text: string, filters: Filter[]): string {
  const rules = filters.filter((f) => FILTERS[f]).map((f) => `- ${FILTERS[f].rule}`)
  return rules.length ? `${text}\n\n[Filters]\n${rules.join('\n')}` : text
}

/** A CSV with quoted fields, doubled quotes and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') row.push(cell), (cell = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      ;(row = []), (cell = '')
    } else cell += c
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows.filter((r) => r.some((x) => x.trim()))
}

/** prompts.chat's prompts.csv (act, prompt, for_devs, type, contributor) as library entries; text prompts only. */
export function fromPromptsChat(csv: string, now = Date.now()): Prompt[] {
  const [head, ...rows] = parseCsv(csv)
  if (!head) return []
  const col = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n)
  const [act, prompt, dev, type] = [col('act'), col('prompt'), col('for_devs'), col('type')]
  if (act < 0 || prompt < 0) return []
  const seen = new Set<string>()
  const out: Prompt[] = []
  for (const r of rows) {
    if (type >= 0 && r[type] && r[type]!.toUpperCase() !== 'TEXT') continue
    const title = r[act]?.trim()
    const body = r[prompt]?.trim()
    if (!title || !body) continue
    let name = slug(title)
    for (let i = 2; seen.has(name); i++) name = `${slug(title).slice(0, 36)}-${i}`
    seen.add(name)
    out.push({ id: `pc-${name}`, name, title, body, tags: dev >= 0 && /true/i.test(r[dev] ?? '') ? ['dev'] : [], source: 'prompts.chat', at: now })
  }
  return out
}

/** Library search: every word in the title, name, tags or body; title hits first. */
export function searchPrompts(list: Prompt[], q: string, limit = 50): Prompt[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return list.slice(0, limit)
  const scored = list
    .map((p) => {
      const head = `${p.title} ${p.name} ${p.tags.join(' ')}`.toLowerCase()
      const body = p.body.toLowerCase()
      if (!words.every((w) => head.includes(w) || body.includes(w))) return null
      return { p, s: words.filter((w) => head.includes(w)).length }
    })
    .filter((x): x is { p: Prompt; s: number } => !!x)
  return scored.sort((a, b) => b.s - a.s || a.p.title.localeCompare(b.p.title)).slice(0, limit).map((x) => x.p)
}

/** A save that keeps the replaced body as a version, newest first, up to 30. */
export function withVersion(old: Prompt | undefined, next: Prompt, note?: string): Prompt {
  if (!old || old.body === next.body) return { ...next, versions: old?.versions ?? next.versions ?? [] }
  return { ...next, versions: [{ at: old.at, body: old.body, ...(note ? { note } : {}) }, ...(old.versions ?? [])].slice(0, 30) }
}
