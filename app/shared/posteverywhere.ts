// Post everywhere: one text, a preview per network, and the request each network's own API takes.
// Pure: no fetch, no clock, no crypto here; the main process sends what these build. Bluesky, Mastodon
// and X requests, counting and limits are shared with Mentions in social.ts; credentials in accounts.ts.
import type { Cred } from './accounts.js'
import { count, cut, LIMITS, type Net, type Req } from './social.js'

export type Preview = { net: Net; text: string; count: number; limit: number | null; ok: boolean; problem?: string }

/** The text as the network would show it; over the limit it says so and never cuts on its own. */
export function preview(net: Net, text: string, title = '', limit = LIMITS[net]): Preview {
  const t = text.trim()
  const n = count(net, t)
  const problem = !t ? 'Nothing to post.'
    : net === 'devto' && !title.trim() ? 'DEV needs a title.'
    : limit !== null && n > limit ? `${n - limit} over the ${limit} limit; it would be cut at "…${cut(net, t, limit).slice(-24)}".`
    : undefined
  return { net, text: t, count: n, limit, ok: !problem, problem }
}

const json = (h: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', ...h })

/* ---------- LinkedIn ---------- */

export const LINKEDIN_VERSION = '202510'
export const linkedinMe = (c: Cred): Req => ({ method: 'GET', url: 'https://api.linkedin.com/v2/userinfo', headers: { Authorization: `Bearer ${c.accessToken}` } })
/** LinkedIn's "little text" format treats these as markup; escaped, they show as typed. */
export const linkedinEscape = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (m) => `\\${m}`)
export function linkedinPost(c: Cred, sub: string, text: string): Req {
  const body = { author: `urn:li:person:${sub}`, commentary: linkedinEscape(text), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }
  return { method: 'POST', url: 'https://api.linkedin.com/rest/posts', headers: json({ Authorization: `Bearer ${c.accessToken}`, 'LinkedIn-Version': LINKEDIN_VERSION, 'X-Restli-Protocol-Version': '2.0.0' }), body: JSON.stringify(body) }
}
export const linkedinUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`

/* ---------- Telegram, Discord, DEV ---------- */

export const telegramPost = (c: Cred, text: string): Req => ({ method: 'POST', url: `https://api.telegram.org/bot${c.accessToken}/sendMessage`, headers: json(), body: JSON.stringify({ chat_id: c.ids?.chat ?? '', text }) })
export const telegramUrl = (chat: string, id: number) => (/^@\w+$/.test(chat.trim()) ? `https://t.me/${chat.trim().slice(1)}/${id}` : null)

export const discordPost = (c: Cred, text: string): Req => ({ method: 'POST', url: `${c.accessToken}?wait=true`, headers: json(), body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }) })
export const discordUrl = (m: { id?: string; channel_id?: string; guild_id?: string }) => (m.guild_id && m.channel_id && m.id ? `https://discord.com/channels/${m.guild_id}/${m.channel_id}/${m.id}` : null)

export const devtoPost = (c: Cred, title: string, body: string): Req => ({ method: 'POST', url: 'https://dev.to/api/articles', headers: json({ 'api-key': c.accessToken, Accept: 'application/vnd.forem.api-v1+json' }), body: JSON.stringify({ article: { title: title.trim(), body_markdown: body, published: true } }) })

export type Result = { net: Net; ok: boolean; url?: string; error?: string }
