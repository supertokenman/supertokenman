// The compactor for what the app itself puts into a prompt (phase 84): memory briefs, document
// passages, answers of the app's own tools. Stages that lose nothing are on by default and can be
// undone exactly; cutting is opt-in and always says what was cut. Code blocks, URLs and diffs are
// never touched.

export type Stage = 'repeats' | 'json' | 'dedup' | 'cut'
export type CompactOpts = { stages: Stage[]; cutLines?: number }
export const LOSSLESS: Stage[] = ['repeats', 'json', 'dedup']

const FENCE = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g

/** Pieces of text that may be compacted, and code blocks that must stay as they are. */
function split(text: string): { code: boolean; t: string }[] {
  const out: { code: boolean; t: string }[] = []
  let at = 0
  for (const m of text.matchAll(FENCE)) {
    const start = m.index! + m[1]!.length
    out.push({ code: false, t: text.slice(at, start) }, { code: true, t: text.slice(start, m.index! + m[0].length) })
    at = m.index! + m[0].length
  }
  out.push({ code: false, t: text.slice(at) })
  return out
}

const isDiff = (t: string) => /^(diff --git|@@ |\+\+\+ |--- )/m.test(t)

/** Runs of the same line become one line with a count: "line  [x12]". */
export function collapseRepeats(t: string): string {
  const lines = t.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; ) {
    let j = i + 1
    while (j < lines.length && lines[j] === lines[i]) j++
    const n = j - i
    out.push(n >= 3 && lines[i]!.trim() ? `${lines[i]}  [x${n}]` : lines.slice(i, j).join('\n'))
    i = j
  }
  return out.join('\n')
}
export const expandRepeats = (t: string) => t.replace(/^(.*)  \[x(\d+)\]$/gm, (_, l: string, n: string) => Array(Number(n)).fill(l).join('\n'))

/** A JSON array of flat objects with the same keys becomes a table; reversible to the same JSON. */
export function jsonToTable(t: string): string {
  return t.replace(/^(\s*)(\[\s*\{[\s\S]*?\}\s*\])\s*$/gm, (all, sp: string, js: string) => {
    let rows: Record<string, unknown>[]
    try {
      rows = JSON.parse(js) as Record<string, unknown>[]
    } catch {
      return all
    }
    if (!Array.isArray(rows) || rows.length < 3) return all
    const keys = Object.keys(rows[0] ?? {})
    const flat = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
    if (!keys.length || !rows.every((r) => r && typeof r === 'object' && Object.keys(r).join('\u0000') === keys.join('\u0000') && keys.every((k) => flat(r[k]) && !String(r[k]).includes('\t') && !String(r[k]).includes('\n')))) return all
    const cell = (v: unknown) => JSON.stringify(v)
    const table = [`${sp}<json-table>`, keys.map((k) => JSON.stringify(k)).join('\t'), ...rows.map((r) => keys.map((k) => cell(r[k])).join('\t')), '</json-table>'].join('\n')
    return table.length < all.length ? table : all
  })
}
export function tableToJson(t: string): string {
  return t.replace(/^(\s*)<json-table>\n([^\n]*)\n([\s\S]*?)\n<\/json-table>$/gm, (_, sp: string, head: string, body: string) => {
    const keys = head.split('\t').map((k) => JSON.parse(k) as string)
    const rows = body.split('\n').map((l) => Object.fromEntries(l.split('\t').map((c, i) => [keys[i]!, JSON.parse(c)])))
    return `${sp}${JSON.stringify(rows)}`
  })
}

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

/** Paragraphs already sent in this panel are replaced by a pointer; `seen` remembers them. */
export function dedup(t: string, seen: Map<string, string>): string {
  return t
    .split(/\n{2,}/)
    .map((p) => {
      if (p.length < 200) return p
      const h = hash(p)
      if (seen.has(h)) return `[same as block ${h}, sent earlier in this panel]`
      seen.set(h, p)
      return p
    })
    .join('\n\n')
}
export const undedup = (t: string, seen: Map<string, string>) => t.replace(/\[same as block (\w+), sent earlier in this panel\]/g, (all, h: string) => seen.get(h) ?? all)

/** Opt-in: long text keeps its head and tail, and says how much was left out. */
export function cut(t: string, max = 120): string {
  const lines = t.split('\n')
  if (lines.length <= max) return t
  const head = Math.ceil(max * 0.6)
  const tail = max - head
  return [...lines.slice(0, head), `[... ${lines.length - max} lines left out by the compactor ...]`, ...lines.slice(-tail)].join('\n')
}

export const tokens = (t: string) => Math.ceil(t.length / 4)

export function compact(text: string, o: CompactOpts, seen = new Map<string, string>()): { text: string; before: number; after: number } {
  const parts = split(text).map((p) => {
    if (p.code || isDiff(p.t)) return p.t
    let t = p.t
    if (o.stages.includes('json')) t = jsonToTable(t)
    if (o.stages.includes('repeats')) t = collapseRepeats(t)
    if (o.stages.includes('dedup')) t = dedup(t, seen)
    if (o.stages.includes('cut')) t = cut(t, o.cutLines)
    return t
  })
  const out = parts.join('')
  return { text: out, before: tokens(text), after: tokens(out) }
}

/** The exact original back from what the lossless stages made. */
export const expand = (t: string, seen = new Map<string, string>()) => expandRepeats(tableToJson(undedup(t, seen)))
