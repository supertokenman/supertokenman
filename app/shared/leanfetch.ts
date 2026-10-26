// Lean fetch: the pieces of reading the web that need no model. How much of a question the pages read
// so far cover (to stop a crawl when it is answered), which links to follow next, text cut to fit a
// context, saved extraction schemas matched to a URL, and per-URL cache rules.

const STOP = new Set('a an and are as at be by can do does for from has have how i in is it its of on or our that the their this to was what when where which who why will with you your'.split(' '))

/** A word's plain stem, enough to match fees/fee and payouts/payout. */
const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && /[^su]s$/.test(w) ? w.slice(0, -1) : w)

/** The question's terms: lower case, no stop words, stems, each once. */
export function terms(question: string): string[] {
  const out = (question.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.%-]*/gu) ?? []).map((w) => w.replace(/[.-]+$/, '')).filter((w) => w.length > 1 && !STOP.has(w)).map(stem)
  return [...new Set(out)]
}

/**
 * Which of the question's terms the texts cover, and the share of them. A term counts when it comes up
 * at least twice: a page that only names it in passing ("read about fees") does not answer it.
 */
export function coverage(question: string, texts: string[], min = 2): { covered: string[]; missing: string[]; share: number } {
  const t = terms(question)
  const count = new Map<string, number>()
  // link labels (a menu's "Fees", "Payouts") name a topic, they do not cover it
  for (const x of texts) for (const w of (x.replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}.%-]*/gu) ?? []).map((w) => stem(w.replace(/[.-]+$/, '')))) count.set(w, (count.get(w) ?? 0) + 1)
  const covered = t.filter((w) => (count.get(w) ?? 0) >= min)
  return { covered, missing: t.filter((w) => !covered.includes(w)), share: t.length ? covered.length / t.length : 1 }
}

export type Link = { href: string; text?: string }

/** The links worth reading next: same site, not seen, not files, those that name missing terms first. */
export function nextLinks(links: Link[], start: string, seen: Set<string>, missing: string[], n = 3): string[] {
  const origin = new URL(start).origin
  const scored: { href: string; score: number }[] = []
  for (const l of links) {
    let u: URL
    try {
      u = new URL(l.href, start)
    } catch {
      continue
    }
    u.hash = ''
    const href = u.toString()
    if (u.origin !== origin || seen.has(href) || /\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js)$/i.test(u.pathname)) continue
    if (scored.some((s) => s.href === href)) continue
    const words = new Set(terms(`${l.text ?? ''} ${decodeURIComponent(u.pathname).replace(/[/_.-]+/g, ' ')}`))
    scored.push({ href, score: missing.filter((m) => words.has(m)).length })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, n).filter((s, i) => s.score > 0 || i < 1).map((s) => s.href)
}

export type CrawlStop = 'covered' | 'no-gain' | 'max-pages' | 'no-links'

/** Whether a crawl stops: the question is covered, two pages in a row added nothing, or the cap is hit. */
export function shouldStop(shares: number[], pages: number, maxPages: number, goal = 1): CrawlStop | null {
  const last = shares[shares.length - 1] ?? 0
  if (last >= goal) return 'covered'
  if (pages >= maxPages) return 'max-pages'
  if (shares.length >= 3 && last <= shares[shares.length - 3]!) return 'no-gain'
  return null
}

/**
 * Text cut into pieces of at most `max` characters, at headings first, then at blank lines, then at
 * sentence ends, so each piece is about one topic and fits a small model's context.
 */
export function chunk(text: string, max = 6000): string[] {
  const out: string[] = []
  const push = (s: string) => {
    const t = s.trim()
    if (t) out.push(t)
  }
  const split = (s: string, seps: RegExp[]) => {
    if (s.length <= max) return push(s)
    const [sep, ...rest] = seps
    if (!sep) {
      for (let i = 0; i < s.length; i += max) push(s.slice(i, i + max))
      return
    }
    let cur = ''
    for (const part of s.split(sep)) {
      if (cur && cur.length + part.length > max) {
        split(cur, rest)
        cur = ''
      }
      cur += part
    }
    split(cur, rest)
  }
  split(text, [/(?=^#{1,3} )/m, /(?<=\n\s*\n)/, /(?<=[.!?]\s)/])
  return out
}

export type Field = { name: string; selector: string; type: 'text' | 'attribute' | 'html'; attribute?: string }
export type Schema = { name: string; prefix: string; baseSelector: string; fields: Field[]; learnedAt: number; runs: number }

/** A schema the model wrote, checked before it is kept: a name, a page prefix, CSS selectors only. */
export function checkSchema(s: Partial<Schema>): string | null {
  if (!s.name || !/^[\w .-]{1,60}$/.test(s.name)) return 'Give the schema a short name.'
  if (!s.prefix || !/^https?:\/\/[^\s]+$/.test(s.prefix)) return 'The page prefix must be an http or https address.'
  if (!s.baseSelector?.trim()) return 'baseSelector is the CSS selector of one repeated item.'
  if (!Array.isArray(s.fields) || s.fields.length === 0) return 'List at least one field.'
  for (const f of s.fields) {
    if (!f?.name || !f.selector) return 'Each field needs a name and a CSS selector.'
    if (!['text', 'attribute', 'html'].includes(f.type)) return `Field ${f.name}: type is text, attribute or html.`
    if (f.type === 'attribute' && !f.attribute) return `Field ${f.name}: say which attribute.`
  }
  return null
}

/** The saved schema for a page: the one with the longest matching prefix, or the one named. */
export function schemaFor(url: string, schemas: Schema[], name?: string): Schema | undefined {
  if (name) return schemas.find((s) => s.name === name)
  return schemas.filter((s) => url.startsWith(s.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0]
}

export type CacheMode = 'enabled' | 'bypass' | 'read_only'
export type CacheRule = { prefix: string; mode: CacheMode }

/** The cache mode for a URL: the longest matching rule, else on. */
export function cacheFor(url: string, rules: CacheRule[]): CacheMode {
  return rules.filter((r) => url.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0]?.mode ?? 'enabled'
}

export type Hit = { url: string; title: string; snippet: string }

/** SearXNG's JSON answer as hits: http(s) only, each address once. */
export function searxHits(json: unknown, n: number): Hit[] {
  const res = (json as { results?: { url?: string; title?: string; content?: string }[] })?.results ?? []
  const seen = new Set<string>()
  const out: Hit[] = []
  for (const r of res) {
    if (!r.url || !/^https?:\/\//.test(r.url) || seen.has(r.url)) continue
    seen.add(r.url)
    out.push({ url: r.url, title: r.title ?? r.url, snippet: (r.content ?? '').slice(0, 300) })
    if (out.length >= n) break
  }
  return out
}
