// Research mode, the parts with no model: a guard against researching people, the planner's answer
// read as questions, passages ranked by keyword (BM25) so only the useful ones reach Claude, the same
// story from several sources merged into one, items scored by relevance, engagement and freshness, and
// a check that every sentence of the report cites a source. Idea from gpt-researcher (Apache-2.0) and
// last30days (MIT); no code copied.
import { chunk, terms } from './leanfetch.js'

export type SourceKind = 'web' | 'hn' | 'github' | 'folder'
export type Item = { kind: SourceKind; url: string; title: string; text: string; engagement?: number; date?: string; also?: { kind: SourceKind; url: string }[] }
export type Scored = Item & { score: number; relevance: number; passages: string[] }
export type Plan = { questions: string[] }
export type Limits = { breadth: number; depth: number; passageChars: number }
export const DEFAULT_LIMITS: Limits = { breadth: 4, depth: 4, passageChars: 2400 }

const PEOPLE = /\b(dossier|background check|who is (?:this|that) (?:person|guy|woman|man)|stalk|doxx?|home address|phone number of|where does .{1,40} live|before (?:a|my) (?:meeting|date|interview) with|everything about (?:him|her|them))\b/i

/** Topics, companies and public projects only: a request that profiles a person is refused. */
export function guard(topic: string): string | null {
  const t = topic.trim()
  if (t.length < 4) return 'Say what to research in a few words.'
  if (PEOPLE.test(t)) return 'Research mode covers topics, companies and public projects, not profiles of people.'
  return null
}

/** The planner prompt: questions only, as JSON, within the breadth limit. */
export function planPrompt(topic: string, breadth: number): string {
  return [
    `You plan research. Topic: ${topic}`,
    `Break it into at most ${breadth} specific questions that, answered together, cover the topic. Each one short enough to search for.`,
    'If the topic asks to profile a private person, answer {"questions": []}.',
    'Answer with one JSON object only: {"questions": ["..."]}',
  ].join('\n')
}

/** The planner's answer as questions: the JSON, or numbered lines when the model wrote prose. */
export function parsePlan(text: string, breadth: number): Plan {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  let qs: string[] = []
  try {
    const v = JSON.parse(json ?? '') as { questions?: unknown }
    if (Array.isArray(v.questions)) qs = v.questions.filter((q): q is string => typeof q === 'string')
  } catch {
    qs = text.split('\n').map((l) => /^\s*(?:\d+[.)]|[-*])\s+(.+)$/.exec(l)?.[1] ?? '').filter(Boolean)
  }
  return { questions: [...new Set(qs.map((q) => q.trim()).filter((q) => q.length > 3))].slice(0, breadth) }
}

/** BM25 of each text against the query; k1 1.2, b 0.75. */
export function bm25(query: string, texts: string[]): number[] {
  const q = terms(query)
  const docs = texts.map((t) => terms(t).length ? (t.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.%-]*/gu) ?? []).map((w) => terms(w)[0] ?? '') : [])
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length) || 1
  const df = new Map(q.map((w) => [w, docs.filter((d) => d.includes(w)).length]))
  return docs.map((d) => {
    let s = 0
    for (const w of q) {
      const f = d.filter((x) => x === w).length
      if (!f) continue
      const idf = Math.log(1 + (docs.length - df.get(w)! + 0.5) / (df.get(w)! + 0.5))
      s += idf * ((f * 2.2) / (f + 1.2 * (1 - 0.75 + (0.75 * d.length) / avg)))
    }
    return s
  })
}

const LINK = /!?\[[^\]]*\]\([^)]*\)/g
/** A footer line: copyright and the usual legal links. */
const BOILER = /^\s*(©|\(c\)|copyright\b|all rights reserved)/i

/** A line that is mostly links: a menu, breadcrumbs, a footer of links. */
const isNav = (line: string) => {
  const links = line.match(LINK)?.join('') ?? ''
  return links.length > 0 && links.length / line.trim().length > 0.6
}

/**
 * A page as passages: a heading starts one, blank lines end one, a long one is cut further; menus and
 * link rows are dropped, and a passage already inside another is dropped too.
 */
export function passagesOf(text: string): string[] {
  return dedupe(cut(text))
}

/** Passages that are not repeats or already inside a longer one. */
export const dedupe = (ps: string[]) => ps.filter((p, i) => ps.indexOf(p) === i && !ps.some((q) => q.length > p.length && q.includes(p)))

function cut(text: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  const flush = () => {
    if (cur.length) out.push(...chunk(cur.join('\n'), 600))
    cur = []
  }
  for (const line of text.split('\n')) {
    // a heading keeps the paragraph under it, even across the blank line between them
    if (!line.trim()) (cur.length === 1 && /^#{1,6} /.test(cur[0]!) ? undefined : flush())
    else if (isNav(line) || BOILER.test(line)) continue
    else {
      if (/^#{1,6} /.test(line)) flush()
      cur.push(line)
    }
  }
  flush()
  return out
}

/** The passages of a text that best answer the question, in their order, within a character budget. */
export function topPassages(question: string, text: string, budget: number): string[] {
  const parts = passagesOf(text)
  const s = bm25(question, parts)
  const order = parts.map((p, i) => ({ p, i, s: s[i]! })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  const kept: typeof order = []
  let used = 0
  for (const x of order) {
    if (used + x.p.length > budget) continue
    kept.push(x)
    used += x.p.length
  }
  return kept.sort((a, b) => a.i - b.i).map((x) => x.p)
}

const normUrl = (u: string) => {
  try {
    const x = new URL(u)
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return u.toLowerCase()
  }
}
const words = (s: string) => new Set(terms(s))
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length
  return inter / Math.max(1, a.size + b.size - inter)
}

/**
 * One item per story: the same address, or titles that share most of their words (an HN thread about
 * a repo, the repo itself), become one item that keeps where else it was seen and adds the engagement.
 */
export function merge(items: Item[]): Item[] {
  const out: Item[] = []
  for (const it of items) {
    const w = words(it.title)
    const same = out.find((o) => normUrl(o.url) === normUrl(it.url) || (w.size >= 3 && jaccard(words(o.title), w) >= 0.6) || (it.kind === 'hn' && o.kind !== 'hn' && it.text.includes(o.url)) || (o.kind === 'hn' && it.kind !== 'hn' && o.text.includes(it.url)))
    if (!same) {
      out.push({ ...it, also: [] })
      continue
    }
    // the primary is the one with the content: a page or repo over a discussion of it
    const keepNew = same.kind === 'hn' && it.kind !== 'hn'
    const primary = keepNew ? it : same
    const other = keepNew ? same : it
    Object.assign(same, { ...primary, engagement: (same.engagement ?? 0) + (it.engagement ?? 0), text: primary.text.length >= other.text.length ? primary.text : other.text, also: [...(same.also ?? []), { kind: other.kind, url: other.url }] })
  }
  return out
}

/** Relevance first; engagement (log scale) and freshness (half-life of 180 days) break near ties. */
export function score(question: string, items: Item[], now = Date.now(), budget = DEFAULT_LIMITS.passageChars): Scored[] {
  const rel = bm25(question, items.map((i) => `${i.title} ${i.title} ${i.text}`))
  const top = Math.max(...rel, 1e-9)
  return items
    .map((it, i) => {
      const relevance = rel[i]! / top
      const eng = Math.min(1, Math.log10(1 + (it.engagement ?? 0)) / 4)
      const age = it.date ? Math.max(0, (now - Date.parse(it.date)) / 86_400_000) : 365
      const fresh = Math.pow(0.5, age / 180)
      return { ...it, relevance, score: 0.7 * relevance + 0.2 * eng + 0.1 * fresh, passages: topPassages(question, it.text, budget) }
    })
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.score - a.score)
}

export type Source = { n: number; kind: SourceKind; url: string; title: string; passages: string[]; also: string[] }

/** The publisher prompt: numbered sources with only their passages, and the citing rule. */
export function publishPrompt(topic: string, questions: string[], sources: Source[]): string {
  return [
    `Write a research report on: ${topic}`,
    `It answers these questions: ${questions.map((q, i) => `(${i + 1}) ${q}`).join(' ')}`,
    'Use only the sources below. Every sentence that states a fact ends with its source as [n]; several as [1][3]. If the sources do not answer something, say so in a short "Gaps" section instead of guessing.',
    'Markdown: a one-paragraph summary, a section per question, then Gaps. No source list; the app adds it.',
    '',
    ...sources.map((s) => `[${s.n}] ${s.title} (${s.url})\n${s.passages.join('\n…\n')}`),
  ].join('\n')
}

export type CitationCheck = { sentences: number; cited: number; uncited: string[]; unknown: number[]; used: number[] }

/** Every factual sentence should cite: which ones do not, and citations to sources that do not exist. */
export function checkCitations(report: string, sources: number): CitationCheck {
  const body = report.replace(/^#+ .*$/gm, '').replace(/^\s*(gaps|summary)\s*:?\s*$/gim, '')
  const gaps = /(^|\n)#+\s*gaps[\s\S]*$/i.exec(report)?.[0] ?? ''
  const text = gaps ? body.replace(gaps.replace(/^#+ .*$/gm, ''), '') : body
  // decimals and abbreviations are not sentence ends: 0.99%, e.g.
  const guarded = text.replace(/(\d)\.(\d)/g, '$1\u2024$2').replace(/\b(e\.g|i\.e|etc|vs)\./gi, (m) => m.replace(/\./g, '\u2024'))
  const sentences = (guarded.replace(/\n+/g, ' ').match(/[^.!?]+[.!?]+(?:\s*(?:\[\d+\])+)?/g) ?? []).map((s) => s.trim().replace(/\u2024/g, '.')).filter((s) => terms(s).length >= 4)
  const cites = (s: string) => [...s.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
  const all = [...report.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
  const uncited = sentences.filter((s) => cites(s).length === 0)
  return { sentences: sentences.length, cited: sentences.length - uncited.length, uncited, unknown: [...new Set(all.filter((n) => n < 1 || n > sources))], used: [...new Set(all.filter((n) => n >= 1 && n <= sources))].sort((a, b) => a - b) }
}

/** What the run will send to Claude, roughly: four characters to a token. */
export const estimateTokens = (plan: string, publish: string) => Math.ceil((plan.length + publish.length) / 4)
