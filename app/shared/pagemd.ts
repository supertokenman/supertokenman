// Page text to Markdown for the agent browser's read tool. Pure: the main process passes the text runs
// of the rendered page (with their tag path and link), this file decides what the model gets.
//
// Drops nav, footer, aside, script, style, template, hidden and unrendered text, and link-heavy short
// blocks (menus, tag clouds). Keeps headings, lists, tables (one row per table row) and code. Links become
// `[text][n]` with a reference list per page. The output is capped per page (about 6 k tokens) and wrapped
// as untrusted: the page is data, never instructions.

export type TextRun = {
  /** id of the nearest block-level ancestor; runs with the same id form one block */
  block: number
  /** id of the nearest table row, for table cells */
  row?: number
  /** tag names from the root to the text node, e.g. ['html', 'body', 'main', 'p', 'a'] */
  tags: string[]
  text: string
  href?: string
  hidden?: boolean
  /** null when the text is not rendered */
  box?: { w: number; h: number } | null
}

export type CleanOptions = { url: string; page?: number; maxTokens?: number }

export type CleanResult = {
  /** the wrapped page, ready for the model */
  markdown: string
  page: number
  pages: number
  more: boolean
}

export const PAGE_TOKENS = 6000
const DROP_TAGS = ['nav', 'footer', 'aside', 'script', 'style', 'noscript', 'template', 'svg']
const HEADING = /^h([1-6])$/

export const estimateTokens = (s: string): number => Math.ceil(s.length / 4)

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

type Kind = { type: 'para' } | { type: 'item' } | { type: 'heading'; level: number } | { type: 'code' } | { type: 'cell' }

const kindOf = (tags: string[]): Kind => {
  if (tags.includes('pre') || tags.includes('code')) return { type: 'code' }
  if (tags.includes('td') || tags.includes('th')) return { type: 'cell' }
  for (let i = tags.length - 1; i >= 0; i--) {
    const h = HEADING.exec(tags[i])
    if (h) return { type: 'heading', level: Number(h[1]) }
  }
  if (tags.includes('li')) return { type: 'item' }
  return { type: 'para' }
}

type Block = { kind: Kind; runs: TextRun[]; row?: number }

/** Keeps the runs that are content, groups them into blocks, drops link-heavy short blocks. */
function blocksOf(runs: TextRun[]): Block[] {
  const kept = runs.filter(
    (r) =>
      !r.hidden &&
      r.box !== null &&
      r.text.trim() !== '' &&
      !r.tags.some((t) => DROP_TAGS.includes(t)),
  )
  const out: Block[] = []
  let cur: { id: number; runs: TextRun[] } | undefined
  for (const r of kept) {
    if (cur && cur.id === r.block) cur.runs.push(r)
    else {
      cur = { id: r.block, runs: [r] }
      out.push({ kind: kindOf(r.tags), runs: cur.runs, row: r.row })
    }
  }
  return out.filter((b) => {
    if (b.kind.type === 'code' || b.kind.type === 'heading' || b.kind.type === 'cell') return true
    const text = squash(b.runs.map((r) => r.text).join(' '))
    const linked = squash(b.runs.filter((r) => r.href).map((r) => r.text).join(' '))
    return !(text.length < 120 && text.length > 0 && linked.length / text.length > 0.5)
  })
}

/** Turns the page's text runs into Markdown pages, wraps the one asked for as untrusted. */
export function cleanPage(runs: TextRun[], opts: CleanOptions): CleanResult {
  const maxChars = (opts.maxTokens ?? PAGE_TOKENS) * 4
  const want = Math.max(1, Math.floor(opts.page ?? 1))
  const origin = safeOrigin(opts.url)
  const links = new Map<string, number>()
  const refs: string[] = []
  const linkNo = (href: string): number | undefined => {
    let abs: string
    try {
      abs = new URL(href, opts.url).href
    } catch {
      return undefined
    }
    if (!/^https?:/.test(abs)) return undefined
    const known = links.get(abs)
    if (known !== undefined) return known
    refs.push(abs)
    links.set(abs, refs.length)
    return refs.length
  }

  const parts: string[] = []
  let rows: string[][] = []
  let tableRow: number | undefined
  const flushTable = () => {
    if (rows.length === 0) return
    const width = rows[0].length
    const lines = [`| ${rows[0].join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`]
    for (const r of rows.slice(1)) lines.push(`| ${r.join(' | ')} |`)
    parts.push(lines.join('\n'))
    rows = []
  }
  for (const b of blocksOf(runs)) {
    if (b.kind.type === 'cell') {
      if (rows.length > 0 && tableRow !== b.row) rows.push([])
      if (rows.length === 0) rows.push([])
      tableRow = b.row
      rows[rows.length - 1].push(cellText(b.runs, linkNo))
      continue
    }
    flushTable()
    if (b.kind.type === 'code') {
      parts.push('```\n' + b.runs.map((r) => r.text).join('').replace(/\n+$/, '') + '\n```')
      continue
    }
    const text = inline(b.runs, linkNo)
    if (!text) continue
    if (b.kind.type === 'heading') parts.push(`${'#'.repeat(b.kind.level)} ${text}`)
    else if (b.kind.type === 'item') parts.push(`- ${text}`)
    else parts.push(text)
  }
  flushTable()

  const body = parts.join('\n\n')
  const chunks = split(body, maxChars)
  const pages = Math.max(1, chunks.length)
  const idx = Math.min(want, pages)
  const chunk = want > pages ? '' : chunks[idx - 1] ?? ''
  const used = [...chunk.matchAll(/\]\[(\d+)\]/g)].map((m) => Number(m[1]))
  const footnotes = [...new Set(used)]
    .sort((a, b) => a - b)
    .map((n) => `[${n}]: ${refs[n - 1]}`)
  const inner = [chunk, footnotes.join('\n')].filter((s) => s !== '').join('\n\n')
  const more = want < pages
  const footer = `(page ${idx} of ${pages}${more ? `; more: call read with page=${idx + 1}` : ''})`
  const markdown = `<untrusted source="${origin}">\n${inner.replace(/<\/?untrusted/gi, '&lt;untrusted')}\n</untrusted>\n${footer}`
  return { markdown, page: idx, pages, more }
}

function cellText(runs: TextRun[], linkNo: (h: string) => number | undefined): string {
  return inline(runs, linkNo).replace(/\|/g, '\\|')
}

function inline(runs: TextRun[], linkNo: (h: string) => number | undefined): string {
  const pieces = runs.map((r) => {
    const t = squash(r.text)
    if (!t) return ''
    const n = r.href ? linkNo(r.href) : undefined
    return n === undefined ? t : `[${t}][${n}]`
  })
  return squash(pieces.join(' '))
}

function split(body: string, maxChars: number): string[] {
  const out: string[] = []
  let rest = body
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n\n', maxChars)
    if (cut < maxChars / 2) cut = maxChars
    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest !== '' || out.length === 0) out.push(rest)
  return out
}

function safeOrigin(url: string): string {
  try {
    const o = new URL(url).origin
    return o === 'null' ? 'unknown' : o
  } catch {
    return 'unknown'
  }
}
