// A small Markdown renderer for Claude's replies: React elements only, never HTML strings.
// Covers what replies use: headings, paragraphs, lists, quotes, fenced code, tables, rules,
// and inline code, bold, italic, strikethrough and links.
import { MemCite } from './MemCite'
import { Fragment, memo, useState, type MouseEvent, type ReactNode } from 'react'
import { fenceInfo, highlight } from './highlight'

export type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

/** Splits Markdown into blocks. An unclosed code fence (a reply still streaming) runs to the end. */
export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const fence = line.match(/^\s*(```|~~~)\s*(.*)$/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!)
      i++
      out.push({ kind: 'code', lang: (fence[2] ?? '').trim(), text: body.join('\n') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      out.push({ kind: 'h', level: h[1]!.length, text: h[2]!.replace(/\s+#+\s*$/, '') })
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ kind: 'hr' })
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1]!)) {
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) rows.push(cells(lines[i++]!))
      out.push({ kind: 'table', head, rows })
      continue
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ''))
      out.push({ kind: 'quote', text: body.join('\n') })
      continue
    }
    const item = line.match(/^\s*([-*+]|(\d+)[.)])\s+(.*)$/)
    if (item) {
      const ordered = Boolean(item[2])
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i]!.match(/^\s*([-*+]|(\d+)[.)])\s+(.*)$/)
        if (m && Boolean(m[2]) === ordered) items.push(m[3]!)
        else if (items.length && /^\s{2,}\S/.test(lines[i]!)) items[items.length - 1] += ' ' + lines[i]!.trim()
        else break
        i++
      }
      out.push({ kind: 'list', ordered, start: ordered ? Number(item[2]) : 1, items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|\s*(```|~~~)|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i]!)) para.push(lines[i++]!)
    out.push({ kind: 'p', text: para.join('\n') })
  }
  return out
}

/** A web link opens in the app's reader window; anything else keeps the default (the browser, mail). */
function inApp(e: MouseEvent<HTMLAnchorElement>) {
  const href = e.currentTarget.getAttribute('href') ?? ''
  if (!/^https?:\/\//i.test(href) || !window.stm?.link) return
  e.preventDefault()
  void window.stm.link.open(href)
}

/** A fenced block: a header with the file or language and Copy, the code coloured, a cut corner. */
function CodeBlock({ info, text }: { info: string; text: string }) {
  const { lang, file } = fenceInfo(info)
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="md-pre">
      <div className="md-head">
        {file ? <span className="md-file" title={file}>{file}</span> : <span className="md-lang">{lang || 'code'}</span>}
        {file && lang && <span className="md-lang">{lang}</span>}
        <button className={`md-copy ${copied ? 'done' : ''}`} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre><code>{highlight(text, lang)}</code></pre>
    </div>
  )
}

/** Inline Markdown: `code`, **bold**, *italic*, ~~struck~~, [links](url) and bare URLs. */
export function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`+)([^`]+?)\1|\*\*([^*]+)\*\*|__([^_]+)__|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w)|(?<!\w)_([^_\s][^_]*?)_(?!\w)|~~([^~]+)~~|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<)]+)|\[mem:([0-9a-f]{7})\]/g
  let last = 0
  let n = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    const k = `${key}-${n++}`
    if (m[2] != null) out.push(<code key={k} className="md-code">{m[2]}</code>)
    else if (m[3] != null || m[4] != null) out.push(<strong key={k}>{inline(m[3] ?? m[4]!, k)}</strong>)
    else if (m[5] != null || m[6] != null) out.push(<em key={k}>{inline(m[5] ?? m[6]!, k)}</em>)
    else if (m[7] != null) out.push(<s key={k}>{inline(m[7], k)}</s>)
    else if (m[8] != null) out.push(<a key={k} href={m[9]} target="_blank" rel="noreferrer" onClick={inApp}>{inline(m[8], k)}</a>)
    else if (m[10] != null) out.push(<a key={k} href={m[10]} target="_blank" rel="noreferrer" onClick={inApp}>{m[10]}</a>)
    else if (m[11] != null) out.push(<MemCite key={k} id={m[11]} />)
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Line breaks inside a paragraph stay line breaks. */
const lines = (text: string, key: string) =>
  text.split('\n').map((l, i, all) => (
    <Fragment key={`${key}-${i}`}>
      {inline(l, `${key}-${i}`)}
      {i < all.length - 1 && <br />}
    </Fragment>
  ))

// parsed replies, newest last: a line drawn again after the windowed transcript scrolled it away is not
// parsed again. The streaming reply changes on every token, so it is left out (it would only churn).
const parsed = new Map<string, Block[]>()
function blocksOf(text: string, live: boolean): Block[] {
  if (live) return parseBlocks(text)
  const hit = parsed.get(text)
  if (hit) return hit
  const b = parseBlocks(text)
  if (text.length > 80) { parsed.set(text, b); if (parsed.size > 600) parsed.delete(parsed.keys().next().value!) }
  return b
}

/** Memoized on the text: a panel redraw (a key in the composer, a HUD tick) does not parse the
 * streaming reply again; only a new token does. */
export const Markdown = memo(function Markdown({ text, live = false }: { text: string; live?: boolean }) {
  return (
    <div className="md">
      {blocksOf(text, live).map((b, i) => {
        const k = `b${i}`
        switch (b.kind) {
          case 'h': {
            const Tag = (`h${Math.min(b.level + 2, 6)}`) as 'h3'
            return <Tag key={k}>{inline(b.text, k)}</Tag>
          }
          case 'p':
            return <p key={k}>{lines(b.text, k)}</p>
          case 'code':
            return <CodeBlock key={k} info={b.lang} text={b.text} />
          case 'list': {
            const items = b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)
            return b.ordered ? <ol key={k} start={b.start}>{items}</ol> : <ul key={k}>{items}</ul>
          }
          case 'quote':
            return <blockquote key={k}>{lines(b.text, k)}</blockquote>
          case 'table':
            return (
              <div key={k} className="md-table">
                <table>
                  <thead>
                    <tr>{b.head.map((c, j) => <th key={j}>{inline(c, `${k}-h${j}`)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, x) => <td key={x}>{inline(c, `${k}-${j}-${x}`)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'hr':
            return <hr key={k} />
        }
      })}
    </div>
  )
})
