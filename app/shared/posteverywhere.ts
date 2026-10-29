// Post everywhere: one text, a preview per network, and the request each network's own API takes.
// Pure: no fetch, no clock, no crypto here; the main process sends what these build.

export type NetId = 'bluesky' | 'mastodon' | 'linkedin' | 'x' | 'telegram' | 'discord' | 'devto'
export const NETS: NetId[] = ['bluesky', 'mastodon', 'linkedin', 'x', 'telegram', 'discord', 'devto']
export const NET_NAME: Record<NetId, string> = { bluesky: 'Bluesky', mastodon: 'Mastodon', linkedin: 'LinkedIn', x: 'X', telegram: 'Telegram', discord: 'Discord', devto: 'DEV' }

/** What the person types to connect each network; every field is kept in the vault. */
export const NET_FIELDS: Record<NetId, { key: string; label: string; secret?: boolean; hint?: string }[]> = {
  bluesky: [{ key: 'handle', label: 'Handle', hint: 'you.bsky.social' }, { key: 'password', label: 'App password', secret: true }, { key: 'pds', label: 'Server (optional)', hint: 'https://bsky.social' }],
  mastodon: [{ key: 'instance', label: 'Instance', hint: 'https://mastodon.social' }, { key: 'token', label: 'Access token', secret: true }, { key: 'limit', label: 'Character limit (optional)', hint: '500' }],
  linkedin: [{ key: 'token', label: 'Access token (w_member_social)', secret: true }],
  x: [{ key: 'apiKey', label: 'API key', secret: true }, { key: 'apiSecret', label: 'API key secret', secret: true }, { key: 'token', label: 'Access token', secret: true }, { key: 'tokenSecret', label: 'Access token secret', secret: true }],
  telegram: [{ key: 'bot', label: 'Bot token', secret: true }, { key: 'chat', label: 'Chat id', hint: '@channel or -100...' }],
  discord: [{ key: 'webhook', label: 'Webhook URL', secret: true, hint: 'https://discord.com/api/webhooks/...' }],
  devto: [{ key: 'apiKey', label: 'API key', secret: true }],
}

export type Creds = Record<string, string>

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
export const graphemes = (s: string) => (segmenter ? [...segmenter.segment(s)].length : [...s].length)
const codepoints = (s: string) => [...s].length
/** X and Mastodon count every link as 23 characters, whatever its length. */
const linksAs23 = (s: string) => codepoints(s.replace(URL_RE, 'x'.repeat(23)))

export const LIMITS: Record<NetId, number | null> = { bluesky: 300, mastodon: 500, x: 280, linkedin: 3000, telegram: 4096, discord: 2000, devto: null }
const COUNT: Record<NetId, (s: string) => number> = { bluesky: graphemes, mastodon: linksAs23, x: linksAs23, linkedin: codepoints, telegram: codepoints, discord: codepoints, devto: codepoints }

export type Preview = { net: NetId; text: string; count: number; limit: number | null; ok: boolean; problem?: string }

/** The text as the network would show it; over the limit it says so and never cuts on its own. */
export function preview(net: NetId, text: string, title = '', limit = LIMITS[net]): Preview {
  const t = text.trim()
  const count = COUNT[net](t)
  const problem = !t ? 'Nothing to post.'
    : net === 'devto' && !title.trim() ? 'DEV needs a title.'
    : limit !== null && count > limit ? `${count - limit} over the ${limit} limit; it would be cut at "…${cut(net, t, limit).slice(-24)}".`
    : undefined
  return { net, text: t, count, limit, ok: !problem, problem }
}

/** Where the text would stop at the limit, for the warning (by grapheme so nothing is split). */
export function cut(net: NetId, text: string, limit: number): string {
  const parts = segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : [...text]
  let out = ''
  for (const p of parts) {
    if (COUNT[net](out + p) > limit) break
    out += p
  }
  return out
}

export type Req = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body?: string }
const json = (h: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', ...h })
const need = (c: Creds, ...ks: string[]) => {
  for (const k of ks) if (!c[k]?.trim()) throw new Error(`Connect again: the ${k} is missing.`)
}
const httpsBase = (u: string, what: string) => {
  const s = u.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s)) throw new Error(`The ${what} must be an https:// address with no path.`)
  return s
}

/* ---------- Bluesky (AT Protocol) ---------- */

export const bskyHost = (c: Creds) => httpsBase(c.pds || 'https://bsky.social', 'server')

export function bskySession(c: Creds): Req {
  need(c, 'handle', 'password')
  return { method: 'POST', url: `${bskyHost(c)}/xrpc/com.atproto.server.createSession`, headers: json(), body: JSON.stringify({ identifier: c.handle.trim().replace(/^@/, ''), password: c.password }) }
}

export type Facet = { index: { byteStart: number; byteEnd: number }; features: { $type: 'app.bsky.richtext.facet#link'; uri: string }[] }

/** Link facets: Bluesky counts positions in UTF-8 bytes, not characters. */
export function linkFacets(text: string): Facet[] {
  const enc = new TextEncoder()
  return [...text.matchAll(URL_RE)].map((m) => {
    const byteStart = enc.encode(text.slice(0, m.index)).length
    return { index: { byteStart, byteEnd: byteStart + enc.encode(m[0]).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] }
  })
}

export function bskyPost(c: Creds, s: { accessJwt: string; did: string }, text: string, now: string): Req {
  const facets = linkFacets(text)
  const record = { $type: 'app.bsky.feed.post', text, createdAt: now, ...(facets.length ? { facets } : {}) }
  return { method: 'POST', url: `${bskyHost(c)}/xrpc/com.atproto.repo.createRecord`, headers: json({ Authorization: `Bearer ${s.accessJwt}` }), body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }) }
}

export const bskyUrl = (handle: string, uri: string) => `https://bsky.app/profile/${handle.trim().replace(/^@/, '')}/post/${uri.split('/').pop()}`

/* ---------- Mastodon ---------- */

export function mastoPost(c: Creds, text: string, key: string): Req {
  need(c, 'instance', 'token')
  return { method: 'POST', url: `${httpsBase(c.instance, 'instance')}/api/v1/statuses`, headers: json({ Authorization: `Bearer ${c.token}`, 'Idempotency-Key': key }), body: JSON.stringify({ status: text }) }
}

/* ---------- LinkedIn ---------- */

export const LINKEDIN_VERSION = '202510'
export function linkedinMe(c: Creds): Req {
  need(c, 'token')
  return { method: 'GET', url: 'https://api.linkedin.com/v2/userinfo', headers: { Authorization: `Bearer ${c.token}` } }
}
/** LinkedIn's "little text" format treats these as markup; escaped, they show as typed. */
export const linkedinEscape = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (m) => `\\${m}`)
export function linkedinPost(c: Creds, sub: string, text: string): Req {
  need(c, 'token')
  const body = { author: `urn:li:person:${sub}`, commentary: linkedinEscape(text), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }
  return { method: 'POST', url: 'https://api.linkedin.com/rest/posts', headers: json({ Authorization: `Bearer ${c.token}`, 'LinkedIn-Version': LINKEDIN_VERSION, 'X-Restli-Protocol-Version': '2.0.0' }), body: JSON.stringify(body) }
}
export const linkedinUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`

/* ---------- X (OAuth 1.0a user context) ---------- */

/** RFC 3986 percent-encoding, as OAuth 1.0a wants it. */
export const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)

export type Hmac = (key: string, data: string) => string
/** The Authorization header; `params` are the query or form parameters (a JSON body is not signed). */
export function oauth1(o: { method: string; url: string; params?: Record<string, string>; consumerKey: string; consumerSecret: string; token: string; tokenSecret: string; nonce: string; timestamp: string; hmacSha1: Hmac }): string {
  const oa: Record<string, string> = { oauth_consumer_key: o.consumerKey, oauth_nonce: o.nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: o.timestamp, oauth_token: o.token, oauth_version: '1.0' }
  const all = { ...(o.params ?? {}), ...oa }
  const paramStr = Object.keys(all).map((k) => [pct(k), pct(all[k])]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&')
  const base = [o.method.toUpperCase(), pct(o.url.split('?')[0]), pct(paramStr)].join('&')
  const sig = o.hmacSha1(`${pct(o.consumerSecret)}&${pct(o.tokenSecret)}`, base)
  return 'OAuth ' + Object.entries({ ...oa, oauth_signature: sig }).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ')
}

export function xPost(c: Creds, text: string, nonce: string, timestamp: string, hmacSha1: Hmac): Req {
  need(c, 'apiKey', 'apiSecret', 'token', 'tokenSecret')
  const url = 'https://api.x.com/2/tweets'
  const auth = oauth1({ method: 'POST', url, consumerKey: c.apiKey, consumerSecret: c.apiSecret, token: c.token, tokenSecret: c.tokenSecret, nonce, timestamp, hmacSha1 })
  return { method: 'POST', url, headers: json({ Authorization: auth }), body: JSON.stringify({ text }) }
}

/* ---------- Telegram, Discord, DEV ---------- */

export function telegramPost(c: Creds, text: string): Req {
  need(c, 'bot', 'chat')
  if (!/^\d+:[\w-]+$/.test(c.bot.trim())) throw new Error('That does not look like a bot token (123456:ABC...).')
  return { method: 'POST', url: `https://api.telegram.org/bot${c.bot.trim()}/sendMessage`, headers: json(), body: JSON.stringify({ chat_id: c.chat.trim(), text }) }
}
export const telegramUrl = (chat: string, id: number) => (/^@\w+$/.test(chat.trim()) ? `https://t.me/${chat.trim().slice(1)}/${id}` : null)

export function discordPost(c: Creds, text: string): Req {
  need(c, 'webhook')
  const u = c.webhook.trim()
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(u)) throw new Error('A Discord webhook URL: https://discord.com/api/webhooks/...')
  return { method: 'POST', url: `${u}?wait=true`, headers: json(), body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }) }
}
export const discordUrl = (m: { id?: string; channel_id?: string; guild_id?: string }) => (m.guild_id && m.channel_id && m.id ? `https://discord.com/channels/${m.guild_id}/${m.channel_id}/${m.id}` : null)

export function devtoPost(c: Creds, title: string, body: string): Req {
  need(c, 'apiKey')
  return { method: 'POST', url: 'https://dev.to/api/articles', headers: json({ 'api-key': c.apiKey, Accept: 'application/vnd.forem.api-v1+json' }), body: JSON.stringify({ article: { title: title.trim(), body_markdown: body, published: true } }) }
}

/** The hosts a connected network reaches, for the confirm step. */
export function hostOf(net: NetId, c: Creds): string {
  try {
    return net === 'bluesky' ? new URL(bskyHost(c)).host : net === 'mastodon' ? new URL(httpsBase(c.instance ?? '', 'instance')).host
      : ({ linkedin: 'api.linkedin.com', x: 'api.x.com', telegram: 'api.telegram.org', discord: 'discord.com', devto: 'dev.to' } as Record<string, string>)[net]
  } catch {
    return '?'
  }
}

export type Result = { net: NetId; ok: boolean; url?: string; error?: string }
