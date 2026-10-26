// Structured extraction with grounding: fields pulled out of a text (a log, a spec, an issue), each with
// the exact quote it came from. A quote that is not literally in the text is rejected, not trusted.
// Idea from google/langextract (Apache-2.0); our own code.

export type FieldSpec = { name: string; description: string; many?: boolean }
export type Span = { start: number; end: number }
export type Extracted = { field: string; value: string; quote: string; span: Span | null; why?: string }

export const CHUNK = 12_000
export const OVERLAP = 400

/** Pieces of the text with their offset, cut at a line break near the size, overlapping a little. */
export function chunks(text: string, size = CHUNK, overlap = OVERLAP): { offset: number; text: string }[] {
  if (text.length <= size) return [{ offset: 0, text }]
  const out: { offset: number; text: string }[] = []
  let at = 0
  while (at < text.length) {
    let end = Math.min(text.length, at + size)
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end)
      if (nl > at + size / 2) end = nl + 1
    }
    out.push({ offset: at, text: text.slice(at, end) })
    if (end >= text.length) break
    at = Math.max(end - overlap, at + 1)
  }
  return out
}

export function extractPrompt(fields: FieldSpec[], piece: string, examples = ''): string {
  return [
    'Extract these fields from the TEXT. Answer with JSON only: {"items":[{"field":"<name>","value":"<value>","quote":"<exact words copied from TEXT>"}]}.',
    'Every quote must be copied character for character from the TEXT, short (one line or less), and must contain the evidence for the value. If a field is not in the text, leave it out. Never guess.',
    'Fields:',
    ...fields.map((f) => `- ${f.name}${f.many ? ' (can appear many times)' : ''}: ${f.description}`),
    examples ? `Examples:\n${examples}` : '',
    'TEXT:',
    '<<<',
    piece,
    '>>>',
  ].filter(Boolean).join('\n')
}

/** Where a quote sits in the text: exact first, then with runs of spaces treated alike. Null if nowhere. */
export function locate(text: string, quote: string, from = 0): Span | null {
  const q = quote.trim()
  if (!q) return null
  const i = text.indexOf(q, from)
  if (i >= 0) return { start: i, end: i + q.length }
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const re = new RegExp(esc, 'g')
  re.lastIndex = from
  const m = re.exec(text)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}

/** The model's answer for one chunk, checked against the chunk and moved to offsets in the whole text. */
export function ground(answer: string, piece: { offset: number; text: string }, fields: FieldSpec[]): Extracted[] {
  const json = /\{[\s\S]*\}/.exec(answer)?.[0]
  let items: { field?: unknown; value?: unknown; quote?: unknown }[] = []
  try {
    if (!json) throw new Error('no JSON')
    items = (JSON.parse(json) as { items?: typeof items }).items ?? []
  } catch {
    return [{ field: '(answer)', value: '', quote: '', span: null, why: 'The model did not answer in JSON.' }]
  }
  const names = new Set(fields.map((f) => f.name))
  return items.map((it) => {
    const field = String(it.field ?? '')
    const value = String(it.value ?? '')
    const quote = String(it.quote ?? '')
    if (!names.has(field)) return { field, value, quote, span: null, why: 'Not one of the fields asked for.' }
    const s = locate(piece.text, quote)
    if (!s) return { field, value, quote, span: null, why: 'The quote is not in the text.' }
    return { field, value, quote, span: { start: s.start + piece.offset, end: s.end + piece.offset } }
  })
}

/** Results from overlapping chunks, the same field and span kept once; grounded ones first in text order. */
export function merge(all: Extracted[]): Extracted[] {
  const seen = new Set<string>()
  const out: Extracted[] = []
  for (const e of all) {
    const k = `${e.field}|${e.span ? `${e.span.start}:${e.span.end}` : `x:${e.quote}`}|${e.value}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out.sort((a, b) => (a.span && b.span ? a.span.start - b.span.start : a.span ? -1 : b.span ? 1 : 0))
}

/** Rough cost before running: about four characters to a token, the prompt per chunk plus a short answer. */
export function estimate(text: string, fields: FieldSpec[]): { chunks: number; tokensIn: number; tokensOut: number } {
  const c = chunks(text)
  const head = extractPrompt(fields, '').length
  return { chunks: c.length, tokensIn: Math.ceil(c.reduce((a, p) => a + p.text.length + head, 0) / 4), tokensOut: c.length * 400 }
}

/** As JSON for other tools: grounded items only, with their offsets. */
export const asJson = (items: Extracted[]) => JSON.stringify(items.filter((i) => i.span).map((i) => ({ field: i.field, value: i.value, quote: i.quote, start: i.span!.start, end: i.span!.end })), null, 2)
