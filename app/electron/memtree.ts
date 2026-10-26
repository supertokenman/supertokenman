// The project's memory as a tree, read the way a person reads a report: the index first, one line per
// entry, then only the entries that matter. A session sees the index for a few hundred tokens and asks
// for the rest by id, instead of the whole history landing in its prompt. Every entry has a stable id
// so an answer can say where it came from ([mem:id]) and the window can open it.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

export type MemKind = 'decision' | 'stopped' | 'summary' | 'note' | 'session' | 'doc' | 'section'
export type MemNode = { id: string; kind: MemKind; date: string; title: string; summary: string; body: string; file: string; parent?: string }

const idOf = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 7)
const firstLine = (body: string) => (body.split('\n').map((l) => l.replace(/^[-*>#\s]+/, '').trim()).find(Boolean) ?? '').slice(0, 140)
const read = (f: string) => {
  try {
    return readFileSync(f, 'utf8')
  } catch {
    return ''
  }
}

/** Entries of a project note: `## YYYY-MM-DD Title` headings, each with its text. */
export function noteEntries(text: string, file: string): MemNode[] {
  const out: MemNode[] = []
  const seen = new Set<string>()
  const parts = text.split(/\n(?=## )/)
  for (const part of parts) {
    const m = /^## (\d{4}-\d\d-\d\d)?\s*(.+)\n?([\s\S]*)$/.exec(part)
    if (!m) continue
    const date = m[1] ?? ''
    const title = m[2]!.trim()
    const body = m[3]!.trim()
    const kind: MemKind = /^Decision:/i.test(title) ? 'decision' : /^Where we stopped/i.test(title) ? 'stopped' : /compact|session/i.test(title) ? 'summary' : 'note'
    // the same entry saved twice (a stop noted again with nothing new) is kept once
    const id = idOf(file, date, title, body.slice(0, 200))
    if (seen.has(id) && out.some((n) => n.id === id && n.body === body)) continue
    seen.add(id)
    out.push({ id: out.some((n) => n.id === id) ? idOf(file, date, title, body, String(out.length)) : id, kind, date, title: title.replace(/^Decision:\s*/i, ''), summary: kind === 'decision' ? firstLine(body).replace(/^Why:\s*/i, 'why: ') : firstLine(body), body, file })
  }
  return out
}

/** A long document as a table of contents: the document, and one child per heading with its text. */
export function docTree(text: string, file: string, date = ''): MemNode[] {
  const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? basename(file).replace(/\.md$/, '')
  const doc: MemNode = { id: idOf(file), kind: 'doc', date, title, summary: firstLine(text.replace(/^# .+$/m, '')), body: '', file }
  const out: MemNode[] = [doc]
  const sections = text.split(/\n(?=#{2,3} )/).slice(1)
  for (const s of sections) {
    const h = /^(#{2,3}) (.+)\n?([\s\S]*)$/.exec(s)
    if (!h) continue
    out.push({ id: idOf(file, h[2]!, String(out.length)), kind: 'section', date, title: h[2]!.trim(), summary: firstLine(h[3]!), body: h[3]!.trim(), file, parent: doc.id })
  }
  // a document without headings is read whole
  if (out.length === 1) doc.body = text
  doc.summary = `${out.length - 1 ? `${out.length - 1} sections. ` : ''}${doc.summary}`.trim()
  return out
}

/** Every entry kept about a project: its note, its session notes and the documents added to it. */
export function memoryNodes(vault: string, project: string): MemNode[] {
  if (!vault) return []
  const out: MemNode[] = []
  const note = join(vault, 'projects', `${project}.md`)
  if (existsSync(note)) out.push(...noteEntries(read(note), relative(vault, note)))
  const sessions = join(vault, 'sessions', project)
  if (existsSync(sessions))
    for (const n of readdirSync(sessions).filter((n) => n.endsWith('.md'))) {
      const f = join(sessions, n)
      const text = read(f)
      const title = /^# (.+)$/m.exec(text)?.[1] ?? n
      const date = /^date: (\S+)/m.exec(text)?.[1]?.slice(0, 10) ?? n.slice(0, 10)
      out.push({ id: idOf(relative(vault, f)), kind: 'session', date, title, summary: firstLine(text.replace(/^---[\s\S]*?---/, '').replace(/^# .+$/m, '')), body: text, file: relative(vault, f) })
    }
  const docs = join(vault, 'docs', project)
  if (existsSync(docs))
    for (const n of readdirSync(docs).filter((n) => n.endsWith('.md'))) {
      const f = join(docs, n)
      out.push(...docTree(read(f), relative(vault, f), new Date(statSync(f).mtimeMs).toISOString().slice(0, 10)))
    }
  return out
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2)

const KIND_ORDER: MemKind[] = ['decision', 'stopped', 'summary', 'session', 'note', 'doc', 'section']
const KIND_LABEL: Record<MemKind, string> = { decision: 'Decisions', stopped: 'Where sessions stopped', summary: 'Session summaries', session: 'Sessions', note: 'Notes', doc: 'Documents', section: 'Document sections' }

/**
 * The index: one line per entry, grouped by kind, newest first. With a query, only the entries that
 * hold its words, best match first; sections of documents show only when asked for.
 */
export function indexText(nodes: MemNode[], query = '', max = 60, near: Map<string, number> = new Map()): string {
  const q = words(query)
  let list = nodes
  if (q.length) {
    list = nodes
      .map((n) => {
        const t = new Set(words(`${n.title} ${n.summary}`))
        const b = new Set(words(n.body))
        // entries close in meaning (from the local index) count even without a shared word
        const score = q.reduce((s, w) => s + (t.has(w) ? 3 : b.has(w) ? 1 : 0), 0) + (near.get(n.id) ?? 0) * 6
        return { n, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.n)
  } else list = nodes.filter((n) => n.kind !== 'section')
  list = list.slice(0, max)
  if (!list.length) return q.length ? `Nothing in this project's memory matches "${query}".` : "This project's memory is empty."
  const lines: string[] = []
  for (const kind of KIND_ORDER) {
    const of = list.filter((n) => n.kind === kind).sort((a, b) => (q.length ? 0 : b.date.localeCompare(a.date)))
    if (!of.length) continue
    lines.push(`${KIND_LABEL[kind]}:`)
    for (const n of of) lines.push(`- ${n.id} ${n.date ? `${n.date} ` : ''}${n.title}${n.summary && n.summary !== n.title ? ` — ${n.summary}` : ''}`)
  }
  const more = (q.length ? nodes.length : nodes.filter((n) => n.kind !== 'section').length) - list.length
  if (more > 0 && !q.length) lines.push(`(${more} older entries: ask with a query)`)
  return lines.join('\n')
}

/** The full text of the entries asked for, each under its id so the answer can cite it. */
export function readText(nodes: MemNode[], ids: string[]): string {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: string[] = []
  for (const id of ids.slice(0, 12)) {
    const n = byId.get(id.trim())
    if (!n) {
      out.push(`[mem:${id}] not found.`)
      continue
    }
    const kids = n.kind === 'doc' ? nodes.filter((c) => c.parent === n.id) : []
    const body = n.body || (kids.length ? `Sections:\n${kids.map((k) => `- ${k.id} ${k.title}${k.summary ? ` — ${k.summary}` : ''}`).join('\n')}` : '')
    out.push(`[mem:${n.id}] ${n.title}${n.date ? ` (${n.date})` : ''}\n${body.slice(0, 6000)}`)
  }
  return out.join('\n\n')
}

export const MEMORY_RULE =
  "Older memory of this project (decisions, where earlier sessions stopped, summaries, notes and added documents) is in the memory tools, not in this prompt. Call memory_index (optionally with a query) to see what is kept, one line each; then memory_read with the ids you need. When an answer uses an entry, cite it as [mem:<id>]."
