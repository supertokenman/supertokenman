// RSSHub routes and feed discovery for News. Idea from DIYgod/RSSHub (an RSS feed for sites that have
// none, on an instance you run or pick) and RSSHub Radar (the feeds a page names in its head).

/** An RSSHub route: "/github/trending/daily", "rsshub:/youtube/user/@x" or "rsshub://youtube/user/@x". */
export function routeOf(input: string): string | null {
  const t = input.trim()
  const m = /^rsshub:\/{0,2}(.+)$/i.exec(t) ?? (/^\/[\w@.~%+-]+(\/[^\s]*)?$/.test(t) ? [t, t.slice(1)] : null)
  if (!m) return null
  const route = `/${m[1]!.replace(/^\/+/, '')}`
  if (route.includes('..') || /\s/.test(route) || route.length < 3) return null
  return route
}

/** The instance address as typed in Settings: http(s), no path tricks, no trailing slash. Empty is off. */
export function cleanInstance(input: string): string {
  const t = input.trim().replace(/\/+$/, '')
  if (!t) return ''
  let u: URL
  try {
    u = new URL(t)
  } catch {
    throw new Error('The RSSHub instance is an address like https://rsshub.example.com.')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('The RSSHub instance starts with https:// (or http:// on your own network).')
  if (u.search || u.hash || u.username) throw new Error('Just the instance address, without a query or a login.')
  return t
}

/** The feed address of a route on an instance; null when the input is not a route. */
export function rsshubUrl(input: string, instance: string): string | null {
  const route = routeOf(input)
  if (!route) return null
  if (!instance) throw new Error('Set an RSSHub instance in News > Rules and more first, then add the route.')
  return `${instance.replace(/\/+$/, '')}${route}`
}

export type Found = { url: string; title: string; type: 'rss' | 'atom' | 'json' }
const TYPES: Record<string, Found['type']> = { 'application/rss+xml': 'rss', 'application/atom+xml': 'atom', 'application/feed+json': 'json', 'application/json': 'json' }
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x != null)
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** The feeds a page names: <link rel="alternate"> of RSS, Atom or JSON Feed, in page order, one per address. */
export function feedLinks(html: string, base: string): Found[] {
  const head = html.split(/<body[\s>]/i)[0] ?? html
  const out: Found[] = []
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
    const type = TYPES[(attr(tag, 'type') ?? '').toLowerCase().trim()]
    const href = attr(tag, 'href')
    if (!rel.includes('alternate') || !type || !href) continue
    let url: string
    try {
      url = new URL(unescape(href), base).href
    } catch {
      continue
    }
    if (!/^https?:/.test(url) || out.some((f) => f.url === url)) continue
    out.push({ url, title: unescape(attr(tag, 'title') ?? '').trim(), type })
  }
  return out
}

/** The usual places a site keeps its feed, tried when the page names none. */
export const COMMON_PATHS = ['/feed', '/rss.xml', '/atom.xml', '/feed.xml', '/index.xml', '/rss', '/feed.json']

/** What a response body is: an XML feed, a JSON Feed, or neither. */
export function feedKind(body: string): Found['type'] | null {
  const head = body.slice(0, 2000)
  if (/<rss[\s>]|<rdf:RDF[\s>]/i.test(head)) return 'rss'
  if (/<feed[\s>]/i.test(head)) return 'atom'
  if (/^\s*\{/.test(head) && /"version"\s*:\s*"https:\/\/jsonfeed\.org\/version\//.test(head)) return 'json'
  return null
}
