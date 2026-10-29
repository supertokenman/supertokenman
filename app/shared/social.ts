// What every social feature shares: how each network counts a post, Bluesky's link facets, and the
// requests that post or reply on Bluesky, Mastodon and X. Pure: no fetch, no clock, no crypto.

export type Net = 'bluesky' | 'mastodon' | 'x' | 'linkedin' | 'telegram' | 'discord' | 'devto'
export type Req = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string }

export const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const split = (s: string) => (segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : [...s])
export const graphemes = (s: string) => split(s).length

/** X and Mastodon count every link as 23 characters, whatever its length. */
const links23 = (s: string) => s.replace(URL_RE, 'x'.repeat(23))

// twitter-text v3: code points in these ranges weigh 1, all others 2; an emoji sequence weighs 2.
const X_LIGHT: [number, number][] = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]]
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u
export function xLength(s: string): number {
  let n = 0
  for (const g of split(links23(s.normalize('NFC')))) {
    if (EMOJI.test(g)) n += 2
    else for (const ch of g) n += X_LIGHT.some(([a, b]) => ch.codePointAt(0)! >= a && ch.codePointAt(0)! <= b) ? 1 : 2
  }
  return n
}

/** Characters per post; Mastodon's is the default and each server can set its own. */
export const LIMITS: Record<Net, number | null> = { bluesky: 300, mastodon: 500, x: 280, linkedin: 3000, telegram: 4096, discord: 2000, devto: null }
const codepoints = (s: string) => [...s].length
const COUNT: Record<Net, (s: string) => number> = { bluesky: graphemes, mastodon: (s) => codepoints(links23(s)), x: xLength, linkedin: codepoints, telegram: codepoints, discord: codepoints, devto: codepoints }
export const count = (net: Net, s: string) => COUNT[net](s)

/** The longest start of the text that fits, cut between graphemes so nothing is split. */
export function cut(net: Net, text: string, limit: number): string {
  let out = ''
  for (const p of split(text)) {
    if (count(net, out + p) > limit) break
    out += p
  }
  return out
}

export type Facet = { index: { byteStart: number; byteEnd: number }; features: { $type: 'app.bsky.richtext.facet#link'; uri: string }[] }
/** Bluesky link facets: positions in UTF-8 bytes, not characters. */
export function linkFacets(text: string): Facet[] {
  const enc = new TextEncoder()
  return [...text.matchAll(URL_RE)].map((m) => {
    const byteStart = enc.encode(text.slice(0, m.index)).length
    return { index: { byteStart, byteEnd: byteStart + enc.encode(m[0]).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] }
  })
}

const json = (h: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', ...h })
/** "mastodon.social" or "https://mastodon.social/" to "https://mastodon.social"; https only, no path. */
export function httpsBase(u: string, what = 'server'): string {
  const s = u.trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s)) throw new Error(`The ${what} must be an https:// address with no path.`)
  return s
}

export type Ref = { uri: string; cid: string }
/** A Bluesky post, or a reply when `reply` is set; links become facets. */
export function bskyRecord(pds: string, jwt: string, did: string, text: string, now: string, reply?: { root: Ref; parent: Ref }): Req {
  const facets = linkFacets(text)
  const record = { $type: 'app.bsky.feed.post', text, createdAt: now, ...(reply ? { reply } : {}), ...(facets.length ? { facets } : {}) }
  return { method: 'POST', url: `${httpsBase(pds, 'Bluesky server')}/xrpc/com.atproto.repo.createRecord`, headers: json({ Authorization: `Bearer ${jwt}` }), body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }) }
}
export const bskyWebUrl = (handle: string, uri: string) => `https://bsky.app/profile/${handle.trim().replace(/^@/, '')}/post/${uri.split('/').pop()}`

/** A Mastodon status; the idempotency key keeps a retry from posting twice. */
export function mastoStatus(server: string, token: string, text: string, idem: string, reply?: { inReplyTo: string; visibility: string }): Req {
  const body = reply ? { status: text, in_reply_to_id: reply.inReplyTo, visibility: reply.visibility } : { status: text }
  return { method: 'POST', url: `${httpsBase(server, 'instance')}/api/v1/statuses`, headers: json({ Authorization: `Bearer ${token}`, 'Idempotency-Key': idem }), body: JSON.stringify(body) }
}

export const X_TWEETS = 'https://api.x.com/2/tweets'
/** A post on X; `auth` is the signed Authorization header for POST X_TWEETS (the JSON body is not signed). */
export function xTweet(text: string, auth: string, inReplyTo?: string): Req {
  return { method: 'POST', url: X_TWEETS, headers: json({ Authorization: auth }), body: JSON.stringify(inReplyTo ? { text, reply: { in_reply_to_tweet_id: inReplyTo } } : { text }) }
}

/** Mastodon gives posts as HTML: the app shows them as plain text, paragraphs kept. */
export function htmlText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

