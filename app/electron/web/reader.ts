// The web reader: tools the panels call to read the web lean, run on this Mac by the Crawl4AI engine
// (engines/web). It lives inside the app as an in-process MCP server, so there is no extra server to
// start and no key: pages are fetched by a local headless browser, robots.txt is checked, and only the
// part of a page that answers the question reaches the model. Schemas the model writes once extract
// later pages with no model at all.
import { createSdkMcpServer, tool, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { cacheFor, checkSchema, chunk, coverage, nextLinks, schemaFor, searxHits, shouldStop, type CacheMode, type CacheRule, type CrawlStop, type Link, type Schema } from '../../shared/leanfetch.js'

let dir = ''
export const setWebDir = (d: string) => (dir = d)
export const webDir = () => dir
const python = () => join(dir, '.venv', 'bin', 'python')
export const webReady = () => Boolean(dir) && existsSync(python()) && existsSync(join(dir, 'read.py'))

export type WebConfig = { cache: CacheRule[]; searchUrl: string; schemas: Schema[] }
let store = ''
/** Where the cache rules, the search address and the learned schemas are kept (userData). */
export const setWebStore = (file: string) => (store = file)
export function webConfig(): WebConfig {
  try {
    const c = JSON.parse(readFileSync(store, 'utf8')) as Partial<WebConfig>
    return { cache: c.cache ?? [], searchUrl: c.searchUrl ?? '', schemas: c.schemas ?? [] }
  } catch {
    return { cache: [], searchUrl: '', schemas: [] }
  }
}
export function saveWebConfig(c: Partial<WebConfig>): WebConfig {
  const next = { ...webConfig(), ...c }
  if (store) writeFileSync(store, JSON.stringify(next, null, 2))
  return next
}

export type Page = { url?: string; title?: string; markdown?: string; chars?: number; rawChars?: number; truncated?: boolean; fit?: boolean; links?: Link[]; items?: unknown[]; error?: string }
export type ReadOpts = { question?: string; cache?: CacheMode; links?: boolean; schema?: Omit<Schema, 'prefix' | 'learnedAt' | 'runs'> }

let reported: (raw: number, kept: number) => void = () => undefined
/** Each page read: its raw HTML size and the text handed to the panel, for the savings ledger. */
export const onRead = (fn: typeof reported) => (reported = fn)

/** One page through the local engine; only http and https, at most 90 seconds. */
export function readPage(url: string, maxChars = 40_000, opts: ReadOpts = {}): Promise<Page> {
  if (!/^https?:\/\//i.test(url)) return Promise.resolve({ error: 'Only http and https pages.' })
  if (!webReady()) return Promise.resolve({ error: 'The web reader is not installed: Connections, Web reader, Install.' })
  const opt = { ...opts, cache: opts.cache ?? cacheFor(url, webConfig().cache), robots: true }
  return new Promise((resolve) =>
    execFile(python(), [join(dir, 'read.py'), url, String(maxChars), JSON.stringify(opt)], { timeout: 90_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8', CRAWL4AI_NO_CLOUD_NOTICE: '1' } }, (err, out) => {
      const line = String(out).trim().split('\n').pop() ?? ''
      try {
        const p = JSON.parse(line) as Page
        if (p.rawChars) reported(p.rawChars, p.markdown?.length ?? 0)
        resolve(p)
      } catch {
        resolve({ error: err ? err.message.slice(0, 300) : 'The reader gave no answer.' })
      }
    }),
  )
}

export type Crawl = { pages: { url: string; title: string; markdown: string; share: number }[]; stop: CrawlStop; covered: string[]; missing: string[]; skipped: { url: string; error: string }[] }

/** Read a site page by page toward a question; stop when the question's terms are all covered. */
export async function crawl(start: string, question: string, maxPages = 8, read = readPage): Promise<Crawl> {
  try {
    new URL(start)
  } catch {
    throw new Error(`${start} is not a valid address.`)
  }
  const seen = new Set<string>()
  const pages: Crawl['pages'] = []
  const skipped: Crawl['skipped'] = []
  const shares: number[] = []
  let queue = [start]
  let stop: CrawlStop = 'no-links'
  while (queue.length) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    const p = await read(url, 12_000, { question, links: true })
    if (p.error) skipped.push({ url, error: p.error })
    else pages.push({ url: p.url ?? url, title: p.title ?? '', markdown: p.markdown ?? '', share: 0 })
    const c = coverage(question, pages.map((x) => x.markdown))
    shares.push(c.share)
    if (pages.length) pages[pages.length - 1]!.share = c.share
    const s = shouldStop(shares, seen.size, maxPages)
    if (s) {
      stop = s
      break
    }
    queue = [...nextLinks(p.links ?? [], p.url ?? url, seen, c.missing), ...queue].filter((u, i, a) => a.indexOf(u) === i)
  }
  const c = coverage(question, pages.map((x) => x.markdown))
  return { pages, stop, covered: c.covered, missing: c.missing, skipped }
}

/** A saved schema run on a page: the items, with no model involved. */
export async function extract(url: string, name?: string, read = readPage): Promise<{ schema?: string; items?: unknown[]; error?: string }> {
  const cfg = webConfig()
  const s = schemaFor(url, cfg.schemas, name)
  if (!s) return { error: `No saved schema for ${url}. Write one with save_schema first.` }
  const p = await read(url, 2000, { schema: { name: s.name, baseSelector: s.baseSelector, fields: s.fields } })
  if (p.error) return { error: p.error }
  saveWebConfig({ schemas: cfg.schemas.map((x) => (x.name === s.name ? { ...x, runs: x.runs + 1 } : x)) })
  return { schema: s.name, items: p.items ?? [] }
}

/** SearXNG (your own or a local one) for the search; nothing is sent to a search engine otherwise. */
export async function search(query: string, n: number, fetcher: typeof fetch = fetch) {
  const base = webConfig().searchUrl.trim().replace(/\/+$/, '')
  if (!base) throw new Error('Set a SearXNG address in the Web reader settings (palette: Web reader) to search.')
  const r = await fetcher(`${base}/search?format=json&q=${encodeURIComponent(query)}`, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`SearXNG answered ${r.status}; turn on the json format in its settings.yml.`)
  return searxHits(await r.json(), n)
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) })
const schemaShape = {
  name: z.string().describe('short name, like "plans"'),
  prefix: z.string().describe('pages this works on: an address prefix, like https://site.com/products'),
  baseSelector: z.string().describe('CSS selector of one repeated item'),
  fields: z.array(z.object({ name: z.string(), selector: z.string().describe('CSS selector inside the item'), type: z.enum(['text', 'attribute', 'html']), attribute: z.string().optional() })),
}

/** The tools as the panels see them. */
export function webReaderServer(): McpServerConfig {
  return createSdkMcpServer({
    name: 'web-reader',
    version: '1.1.0',
    tools: [
      tool(
        'read_page',
        'Read a web page as clean Markdown, fetched on this Mac by a headless browser (pages that need JavaScript work too). Pass the question to get only the passages that answer it. robots.txt is respected. Long pages come in parts: ask for part 2, 3... Free, no key.',
        {
          url: z.string().url().describe('the page, http or https'),
          question: z.string().optional().describe('what you need from the page; only matching passages are kept'),
          part: z.number().int().min(1).optional().describe('which part of a long page (default 1)'),
          cache: z.enum(['enabled', 'bypass', 'read_only']).optional().describe('enabled reuses a saved copy; bypass reads fresh; read_only never fetches'),
        },
        async ({ url, question, part, cache }) => {
          const p = await readPage(url, 200_000, { question, cache })
          if (p.error) return text(`Could not read ${url}: ${p.error}`, true)
          const parts = chunk(p.markdown ?? '', 12_000)
          const i = Math.min((part ?? 1) - 1, Math.max(0, parts.length - 1))
          const note = parts.length > 1 ? `\n\n[part ${i + 1} of ${parts.length}${i + 1 < parts.length ? `; ask for part ${i + 2} for more` : ''}]` : ''
          const fit = question ? (p.fit ? `\n[only the passages about: ${question}]` : `\n[nothing matched "${question}" closely; the whole page]`) : ''
          return text(`# ${p.title || p.url}\n${p.url}${fit}\n\n${parts[i] ?? ''}${note}`)
        },
        { annotations: { readOnlyHint: true, openWorldHint: true } },
      ),
      tool(
        'crawl_site',
        'Read a site toward a question: start at a page, follow its own links that look relevant, and stop as soon as the question is covered (or after max_pages). Returns the matching passages of each page with its address, for citing.',
        { url: z.string().url(), question: z.string().min(3), max_pages: z.number().int().min(1).max(20).optional().describe('default 8') },
        async ({ url, question, max_pages }) => {
          const c = await crawl(url, question, max_pages ?? 8)
          const why = { covered: 'the question is covered', 'no-gain': 'the last pages added nothing new', 'max-pages': `the cap of ${max_pages ?? 8} pages`, 'no-links': 'no more relevant links' }[c.stop]
          const body = c.pages.map((p, i) => `## [${i + 1}] ${p.title || p.url}\n${p.url}\n\n${p.markdown}`).join('\n\n')
          const tail = `\n\nStopped: ${why}. ${c.pages.length} pages read.${c.missing.length ? ` Not found: ${c.missing.join(', ')}.` : ''}${c.skipped.length ? `\nSkipped: ${c.skipped.map((s) => `${s.url} (${s.error})`).join('; ')}` : ''}`
          return text(body + tail, c.pages.length === 0)
        },
        { annotations: { readOnlyHint: true, openWorldHint: true } },
      ),
      tool(
        'save_schema',
        'Save CSS selectors that pull repeated items (products, prices, rows) from pages under an address prefix. Look at the page once to write them; after this, extract runs them with no model. Overwrites a schema with the same name.',
        schemaShape,
        async (s) => {
          const bad = checkSchema(s as Schema)
          if (bad) return text(bad, true)
          const cfg = webConfig()
          saveWebConfig({ schemas: [...cfg.schemas.filter((x) => x.name !== s.name), { ...(s as Schema), learnedAt: Date.now(), runs: 0 }] })
          return text(`Saved "${s.name}" for ${s.prefix}. Run extract on a page to check it.`)
        },
      ),
      tool(
        'extract',
        'Pull items from a page with a saved schema (found by the page address, or by name). No model is used, so it costs nothing.',
        { url: z.string().url(), schema: z.string().optional() },
        async ({ url, schema }) => {
          const r = await extract(url, schema)
          if (r.error) return text(r.error, true)
          return text(`${r.items!.length} items with "${r.schema}":\n${JSON.stringify(r.items, null, 1).slice(0, 30_000)}${r.items!.length === 0 ? '\nNo items: the page changed or the selectors are wrong; look at the page and save the schema again.' : ''}`)
        },
        { annotations: { readOnlyHint: true, openWorldHint: true } },
      ),
      tool(
        'search_web',
        'Search with your SearXNG, then read the top pages with the question and return their matching passages numbered for citing as [1], [2]. Answer with those sources.',
        { query: z.string().min(2), pages: z.number().int().min(1).max(6).optional().describe('how many top pages to read (default 3)') },
        async ({ query, pages }) => {
          let hits
          try {
            hits = await search(query, pages ?? 3)
          } catch (e) {
            return text((e as Error).message, true)
          }
          if (hits.length === 0) return text(`No results for ${query}.`, true)
          const read = await Promise.all(hits.map((h) => readPage(h.url, 8000, { question: query })))
          const body = hits.map((h, i) => `## [${i + 1}] ${h.title}\n${h.url}\n\n${read[i]!.error ? `(not read: ${read[i]!.error}) ${h.snippet}` : read[i]!.markdown}`).join('\n\n')
          return text(`${body}\n\nSources:\n${hits.map((h, i) => `[${i + 1}] ${h.url}`).join('\n')}`)
        },
        { annotations: { readOnlyHint: true, openWorldHint: true } },
      ),
    ],
  })
}
