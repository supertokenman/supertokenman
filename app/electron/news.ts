// News from RSS and Atom: open, free, no account. Feeds are parsed here with no dependency; a site
// address is enough, its feed is found from the page. Articles open in a plain reader made from the page.

export type Feed = { url: string; title: string }
export type Item = { id: string; feed: string; source: string; title: string; link: string; date: string; summary: string; image?: string }

// offered in the reader with one click each; none is read until the person adds it
export const SUGGESTED_FEEDS: Feed[] = [
  { url: 'https://hnrss.org/frontpage', title: 'Hacker News' },
  { url: 'https://simonwillison.net/atom/everything/', title: 'Simon Willison' },
  { url: 'https://github.blog/feed/', title: 'GitHub Blog' },
  { url: 'https://blog.cloudflare.com/rss/', title: 'Cloudflare' },
  { url: 'https://dev.to/feed', title: 'DEV' },
  { url: 'https://tecnoblog.net/feed/', title: 'Tecnoblog' },
]

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }
export const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
/** Markup to plain text: tags out, entities in, whitespace folded. */
export const text = (html: string) => decode(decode(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1]
const attr = (xml: string, name: string, a: string) => xml.match(new RegExp(`<${name}\\s[^>]*${a}=["']([^"']+)["']`, 'i'))?.[1]
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36)

/** Items of an RSS 2.0 or Atom document, newest first. */
export function parseFeed(xml: string, feedUrl: string): { title: string; items: Item[] } {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml)
  const head = xml.split(atom ? /<entry[\s>]/i : /<item[\s>]/i)[0] ?? ''
  const title = text(tag(head, 'title') ?? new URL(feedUrl).host)
  const blocks = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? []
  const items = blocks.map((b): Item => {
    const link = atom ? (b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i)?.[1] ?? attr(b, 'link', 'href') ?? '') : text(tag(b, 'link') ?? '') || text(tag(b, 'guid') ?? '')
    const rawDate = text(tag(b, atom ? 'updated' : 'pubDate') ?? tag(b, 'published') ?? tag(b, 'dc:date') ?? '')
    const date = Number.isNaN(Date.parse(rawDate)) ? '' : new Date(rawDate).toISOString()
    const body = tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content') ?? tag(b, 'content:encoded') ?? ''
    const image = attr(b, 'media:content', 'url') ?? attr(b, 'media:thumbnail', 'url') ?? b.match(/<enclosure[^>]*type=["']image[^"']*["'][^>]*url=["']([^"']+)/i)?.[1] ?? b.match(/<enclosure[^>]*url=["']([^"']+\.(?:jpe?g|png|webp))/i)?.[1] ?? decode(body).match(/<img[^>]+src=["']([^"']+)/i)?.[1]
    return { id: hash(link || tag(b, 'title') || b.slice(0, 80)), feed: feedUrl, source: title, title: text(tag(b, 'title') ?? '(untitled)'), link, date, summary: text(body).slice(0, 280), image: image?.startsWith('http') ? decode(image) : undefined }
  })
  return { title, items: items.sort((a, b) => b.date.localeCompare(a.date)) }
}

type Get = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; url: string }>
const get: Get = (url) => fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SuperTokenMan', Accept: 'application/rss+xml, application/atom+xml, text/xml, text/html;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(12_000) })

const isFeed = (body: string) => /<(rss|feed|rdf:RDF)[\s>]/i.test(body.slice(0, 2000))

/** A feed from a feed address or from a site's address: the page's alternate link, then the usual paths. */
export async function discover(input: string, g: Get = get): Promise<Feed> {
  const url = /^https?:\/\//.test(input.trim()) ? input.trim() : `https://${input.trim()}`
  const r = await g(url)
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`)
  const body = await r.text()
  if (isFeed(body)) return { url: r.url || url, title: parseFeed(body, url).title }
  const alt = [...body.matchAll(/<link[^>]+>/gi)].map((m) => m[0]).find((l) => /rel=["']alternate["']/i.test(l) && /application\/(rss|atom)\+xml/i.test(l))
  const candidates = [alt?.match(/href=["']([^"']+)/i)?.[1], '/feed', '/rss.xml', '/atom.xml', '/feed.xml', '/index.xml'].filter(Boolean) as string[]
  for (const c of candidates) {
    const f = new URL(decode(c), r.url || url).href
    try {
      const x = await g(f)
      const xb = x.ok ? await x.text() : ''
      if (isFeed(xb)) return { url: f, title: parseFeed(xb, f).title }
    } catch {
      // try the next path
    }
  }
  throw new Error('No feed found on that site.')
}

/** All feeds at once; one failing reports itself and the rest still arrive. */
export async function fetchAll(feeds: Feed[], g: Get = get): Promise<{ items: Item[]; errors: { feed: string; error: string }[] }> {
  const out = await Promise.allSettled(
    feeds.map(async (f) => {
      const r = await g(f.url)
      if (!r.ok) throw new Error(`answered ${r.status}`)
      // a busy feed (DEV posts every minute) would bury the rest: each feed brings its newest 12
      return parseFeed(await r.text(), f.url).items.slice(0, 12).map((i) => ({ ...i, source: f.title || i.source }))
    }),
  )
  const items = out.flatMap((o) => (o.status === 'fulfilled' ? o.value : []))
  const errors = out.flatMap((o, i) => (o.status === 'rejected' ? [{ feed: feeds[i]!.title, error: (o.reason as Error).message }] : []))
  return { items: interleave(items).slice(0, 300), errors }
}

/** Newest first, but one source never runs twice in a row while another still has news. */
export function interleave(items: Item[]): Item[] {
  const queues = new Map<string, Item[]>()
  for (const i of [...items].sort((a, b) => b.date.localeCompare(a.date))) queues.set(i.source, [...(queues.get(i.source) ?? []), i])
  const out: Item[] = []
  let last = ''
  while (out.length < items.length) {
    const heads = [...queues.entries()].filter(([, q]) => q.length).sort(([, a], [, b]) => b[0]!.date.localeCompare(a[0]!.date))
    const pick = heads.find(([s]) => s !== last) ?? heads[0]!
    out.push(pick[1].shift()!)
    last = pick[0]
  }
  return out
}

/** A readable copy of an article: its title and the paragraphs of its main text, nothing else. */
export async function reader(url: string, g: Get = get): Promise<{ title: string; paragraphs: string[]; image?: string }> {
  if (!/^https?:\/\//.test(url)) throw new Error('Not a web address.')
  const r = await g(url)
  if (!r.ok) throw new Error(`answered ${r.status}`)
  return extract(await r.text())
}

export function extract(html: string): { title: string; paragraphs: string[]; image?: string } {
  const title = text(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ?? tag(html, 'title') ?? '')
  const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]
  const scope = tag(html, 'article') ?? tag(html, 'main') ?? html
  const paragraphs = [...scope.matchAll(/<(p|h2|h3|li|blockquote)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)]
    .map((m) => ({ k: m[1]!.toLowerCase(), t: text(m[2]!) }))
    .filter((p) => p.t.length > (p.k === 'p' ? 40 : p.k === 'li' ? 30 : 1))
    .map((p) => (p.k === 'h2' || p.k === 'h3' ? `## ${p.t}` : p.k === 'li' ? `• ${p.t}` : p.t))
    .slice(0, 120)
  return { title, paragraphs, image: image && /^https?:\/\//.test(image) ? decode(image) : undefined }
}
