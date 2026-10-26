// Research mode: a planner writes the questions, executors read the sources for each question in
// parallel, and a publisher writes a report where every claim cites a source. Only the passages that
// answer a question reach Claude (BM25 here, for free). Sources are official APIs and pages only:
// SearXNG plus the web reader, the Hacker News search API, the GitHub search API, and a local folder.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkCitations, dedupe, DEFAULT_LIMITS, estimateTokens, guard, merge, parsePlan, planPrompt, publishPrompt, score, type CitationCheck, type Item, type Limits, type Scored, type Source, type SourceKind } from '../shared/research.js'
import type { Hit } from '../shared/leanfetch.js'
import type { Page, ReadOpts } from './web/reader.js'
import { OLLAMA } from './small.js'

export const HN_API = process.env.STM_HN_API ?? 'https://hn.algolia.com/api/v1'
export const GH_API = process.env.STM_GH_API ?? 'https://api.github.com'

export type Deps = {
  ask: (prompt: string) => Promise<string>
  search: (query: string, n: number) => Promise<Hit[]>
  read: (url: string, max: number, o: ReadOpts) => Promise<Page>
  fetch: typeof fetch
  /** The budget brake: null to go on, or why not. */
  allow: (tokens: number) => string | null
  emit: (e: ResearchEvent) => void
}

export type ResearchEvent =
  | { stage: 'plan'; questions: string[] }
  | { stage: 'read'; question: number; kind: SourceKind; found: number; error?: string }
  | { stage: 'sources'; sources: Source[] }
  | { stage: 'publish'; tokens: number }
  | { stage: 'done'; report: string; check: CitationCheck; sources: Source[]; tokens: number }
  | { stage: 'stopped'; why: string }

export type Run = { topic: string; kinds: SourceKind[]; folder?: string; limits?: Partial<Limits> }

const TEXT = new Set(['.md', '.mdx', '.txt', '.rst', '.csv', '.json', '.html', '.org'])

/** The text files of a folder: up to 400 files, 1 MB each, no hidden folders or node_modules. */
export function folderItems(dir: string, max = 400): Item[] {
  const out: Item[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 6 || out.length >= max) return
    let names: string[] = []
    try {
      names = readdirSync(d)
    } catch {
      return
    }
    for (const n of names) {
      if (n.startsWith('.') || n === 'node_modules') continue
      const p = join(d, n)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p, depth + 1)
      else if (TEXT.has(extname(n).toLowerCase()) && st.size <= 1_000_000 && out.length < max) out.push({ kind: 'folder', url: pathToFileURL(p).toString(), title: relative(dir, p), text: readFileSync(p, 'utf8'), date: st.mtime.toISOString() })
    }
  }
  walk(dir, 0)
  return out
}

/** Hacker News stories through its official search API (Algolia), with points and comments. */
export async function hnItems(q: string, n: number, f: typeof fetch): Promise<Item[]> {
  const r = await f(`${HN_API}/search?tags=story&hitsPerPage=${n}&query=${encodeURIComponent(q)}`)
  if (!r.ok) throw new Error(`Hacker News answered ${r.status}`)
  const j = (await r.json()) as { hits?: { objectID: string; title?: string; url?: string; points?: number; num_comments?: number; created_at?: string; story_text?: string }[] }
  return (j.hits ?? []).map((h) => ({ kind: 'hn' as const, url: `https://news.ycombinator.com/item?id=${h.objectID}`, title: h.title ?? '', text: [h.title, h.url, h.story_text?.replace(/<[^>]+>/g, ' ')].filter(Boolean).join('\n'), engagement: (h.points ?? 0) + (h.num_comments ?? 0), date: h.created_at }))
}

/** Public repositories through GitHub's search API: name, description, topics, stars, last push. */
export async function githubItems(q: string, n: number, f: typeof fetch): Promise<Item[]> {
  const r = await f(`${GH_API}/search/repositories?per_page=${n}&q=${encodeURIComponent(q)}`, { headers: { accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub answered ${r.status}${r.status === 403 ? ' (rate limit; try again in a minute)' : ''}`)
  const j = (await r.json()) as { items?: { full_name: string; html_url: string; description?: string; topics?: string[]; stargazers_count?: number; pushed_at?: string; license?: { spdx_id?: string } }[] }
  return (j.items ?? []).map((x) => ({ kind: 'github' as const, url: x.html_url, title: `${x.full_name}: ${x.description ?? ''}`.trim(), text: [x.description, (x.topics ?? []).join(' '), x.license?.spdx_id ? `License ${x.license.spdx_id}` : ''].filter(Boolean).join('\n'), engagement: x.stargazers_count ?? 0, date: x.pushed_at }))
}

/** The web: SearXNG for addresses, then the reader for the passages about the question. */
async function webItems(q: string, n: number, d: Deps): Promise<Item[]> {
  const hits = await d.search(q, n)
  const pages = await Promise.all(hits.map((h) => d.read(h.url, 30_000, { question: q })))
  return hits.map((h, i) => ({ kind: 'web' as const, url: pages[i]!.url ?? h.url, title: pages[i]!.title || h.title, text: pages[i]!.error ? h.snippet : (pages[i]!.markdown ?? '') }))
}

/** One run: plan, read in parallel, filter, publish, check the citations. */
export async function research(run: Run, d: Deps): Promise<ResearchEvent> {
  const stop = (why: string) => {
    const e = { stage: 'stopped' as const, why }
    d.emit(e)
    return e
  }
  const bad = guard(run.topic)
  if (bad) return stop(bad)
  const lim = { ...DEFAULT_LIMITS, ...run.limits }
  const pp = planPrompt(run.topic, lim.breadth)
  const brake = d.allow(estimateTokens(pp, ''))
  if (brake) return stop(brake)
  const plan = parsePlan(await d.ask(pp), lim.breadth)
  if (plan.questions.length === 0) return stop('The planner gave no questions; the topic may be out of scope. Rephrase it as a topic, company or project.')
  d.emit({ stage: 'plan', questions: plan.questions })

  const folder = run.kinds.includes('folder') && run.folder ? folderItems(run.folder) : []
  const per = await Promise.all(
    plan.questions.map(async (q, qi) => {
      const got = await Promise.all(
        run.kinds.map(async (kind) => {
          try {
            const items = kind === 'web' ? await webItems(q, lim.depth, d) : kind === 'hn' ? await hnItems(q, lim.depth, d.fetch) : kind === 'github' ? await githubItems(q, lim.depth, d.fetch) : folder
            d.emit({ stage: 'read', question: qi, kind, found: items.length })
            return items
          } catch (e) {
            d.emit({ stage: 'read', question: qi, kind, found: 0, error: (e as Error).message })
            return []
          }
        }),
      )
      return score(q, merge(got.flat()), Date.now(), lim.passageChars).slice(0, lim.depth)
    }),
  )

  // one numbered source per story across all questions, with the passages each question kept
  const byUrl = new Map<string, Scored & { qs: Set<number> }>()
  per.forEach((list, qi) =>
    list.forEach((s) => {
      const had = byUrl.get(s.url)
      if (had) (had.passages = dedupe([...had.passages, ...s.passages])), had.qs.add(qi)
      else byUrl.set(s.url, { ...s, qs: new Set([qi]) })
    }),
  )
  const sources: Source[] = [...byUrl.values()].filter((s) => s.passages.length).sort((a, b) => b.score - a.score).map((s, i) => ({ n: i + 1, kind: s.kind, url: s.url, title: s.title, passages: s.passages, also: (s.also ?? []).map((a) => a.url) }))
  d.emit({ stage: 'sources', sources })
  if (sources.length === 0) return stop('No source had a passage about these questions. Try other sources or a wider topic.')

  const pub = publishPrompt(run.topic, plan.questions, sources)
  const tokens = estimateTokens(pp, pub)
  const brake2 = d.allow(tokens)
  if (brake2) return stop(brake2)
  d.emit({ stage: 'publish', tokens })
  const report = (await d.ask(pub)).trim()
  const done = { stage: 'done' as const, report, check: checkCitations(report, sources.length), sources, tokens }
  d.emit(done)
  return done
}

/** The sources as the report's last section, numbered like the citations. */
export const sourceList = (sources: Source[]) => `\n\n## Sources\n${sources.map((s) => `${s.n}. [${s.title}](${s.url})${s.also.length ? ` (also: ${s.also.join(', ')})` : ''}`).join('\n')}\n`

/**
 * Structured data from a page or a document by a JSON schema, on the local model: Ollama's structured
 * output holds the answer to the schema. Free; nothing leaves the machine except the page fetch.
 */
export async function extractLocal(model: string, text: string, schema: object, f: typeof fetch = fetch): Promise<unknown> {
  const r = await f(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, think: false, format: schema, options: { temperature: 0, num_ctx: 16384 }, messages: [{ role: 'user', content: `Extract the data the JSON schema asks for from this text. Use only what the text says; leave a field out or null when it is not there.\n\n${text.slice(0, 40_000)}` }] }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!r.ok) throw new Error(`Ollama answered ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { message?: { content?: string } }
  try {
    return JSON.parse(j.message?.content ?? '')
  } catch {
    throw new Error('The local model did not answer with JSON for that schema.')
  }
}
