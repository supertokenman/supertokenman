// Niche import: parse captions the user pastes or exports (CSV/JSON) and count them per hook format.
// Pure: no I/O and no remote calls. A pasted link is kept as a label only; it is never opened.

import { detectFormat, type FormatId } from './hookfmt.js'

export type NicheRow = {
  caption: string
  format: FormatId | null
  /** Dates as the user wrote them; not parsed. */
  date?: string
  /** User-supplied view count. Undefined when not given or not a valid non-negative number. */
  views?: number
  /** Links found in the caption, kept as text labels. */
  links: string[]
}

export type MedianResult = { kind: 'median'; value: number } | { kind: 'no-views' }

export type NicheSummary = {
  total: number
  /** Count per built-in format; `null` key is captions that match no format. */
  counts: Record<FormatId | 'none', number>
  median: MedianResult
  notice: string
}

export const NICHE_NOTICE = 'Numbers are from your import, not measured by the app.'

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

/** Pull http(s) links out of a caption. They are labels only; nothing is requested. */
export function extractLinks(caption: string): string[] {
  return caption.match(URL_RE) ?? []
}

function toRow(caption: string, date: string | undefined, views: unknown): NicheRow | null {
  const text = caption.trim()
  if (text === '') return null
  const row: NicheRow = { caption: text, format: detectFormat(text), links: extractLinks(text) }
  if (date !== undefined && date.trim() !== '') row.date = date.trim()
  const n = typeof views === 'string' ? Number(views.trim()) : views
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && (typeof views !== 'string' || views.trim() !== '')) {
    row.views = n
  }
  return row
}

/** Pasted text: one caption per non-empty line. No views are given in pasted text. */
export function parsePasted(text: string): NicheRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => toRow(line, undefined, undefined))
    .filter((r): r is NicheRow => r !== null)
}

/** Split one CSV record, honouring double quotes and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** CSV with a header row. Needs a `caption` column; `date` and `views` are optional. */
export function parseCsv(text: string): NicheRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []
  const header = splitCsvLine(lines[0] as string).map((h) => h.trim().toLowerCase())
  const cap = header.indexOf('caption')
  if (cap === -1) throw new Error('CSV needs a caption column')
  const dateIdx = header.indexOf('date')
  const viewsIdx = header.indexOf('views')
  const rows: NicheRow[] = []
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const row = toRow(cells[cap] ?? '', cells[dateIdx] ?? undefined, viewsIdx === -1 ? undefined : cells[viewsIdx])
    if (row) rows.push(row)
  }
  return rows
}

/**
 * JSON: an array of strings (captions) or of objects with `caption`, and optionally `date` and `views`.
 * Anything else is an error.
 */
export function parseJson(text: string): NicheRow[] {
  const data: unknown = JSON.parse(text)
  if (!Array.isArray(data)) throw new Error('JSON must be an array')
  const rows: NicheRow[] = []
  for (const item of data) {
    if (typeof item === 'string') {
      const row = toRow(item, undefined, undefined)
      if (row) rows.push(row)
    } else if (item !== null && typeof item === 'object') {
      const o = item as Record<string, unknown>
      if (typeof o.caption !== 'string') throw new Error('JSON object needs a caption string')
      const date = typeof o.date === 'string' ? o.date : undefined
      const row = toRow(o.caption, date, o.views)
      if (row) rows.push(row)
    } else {
      throw new Error('JSON items must be strings or objects')
    }
  }
  return rows
}

/** Count rows per built-in format. Captions that match no format go under `none`. */
export function countByFormat(rows: readonly NicheRow[]): Record<FormatId | 'none', number> {
  const counts: Record<FormatId | 'none', number> = { choice: 0, when: 0, facts: 0, sendto: 0, none: 0 }
  for (const r of rows) counts[r.format ?? 'none'] += 1
  return counts
}

/** Median of the given view counts. Rows without views are left out. */
export function medianViews(rows: readonly NicheRow[]): MedianResult {
  const v = rows
    .map((r) => r.views)
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b)
  if (v.length === 0) return { kind: 'no-views' }
  const mid = Math.floor(v.length / 2)
  const value = v.length % 2 === 1 ? (v[mid] as number) : ((v[mid - 1] as number) + (v[mid] as number)) / 2
  return { kind: 'median', value }
}

/** Summarise parsed rows: counts per format, median of given views, and the notice to show with them. */
export function summarize(rows: readonly NicheRow[]): NicheSummary {
  return {
    total: rows.length,
    counts: countByFormat(rows),
    median: medianViews(rows),
    notice: NICHE_NOTICE,
  }
}
