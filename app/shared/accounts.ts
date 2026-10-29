// One connection per network, shared by Business, Post everywhere and Mentions. Each lives in the vault
// as SOCIAL_<NET> (electron/social/store.ts); this file says what the person types to connect a network
// by pasting keys, and turns that into the saved credential. Pure: Bluesky's sign-in happens in main.
import { httpsBase, type Net } from './social.js'

export type Cred = {
  accessToken: string
  refreshToken?: string
  /** ms epoch */
  expiresAt?: number
  clientId?: string
  clientSecret?: string
  /** what the network needs besides the token, not secret (page id, did, handle, server, chat id...) */
  ids?: Record<string, string>
  /** secrets besides the token (X's four OAuth 1.0a keys) */
  keys?: Record<string, string>
}

export const ACCOUNTS: Net[] = ['bluesky', 'mastodon', 'linkedin', 'x', 'telegram', 'discord', 'devto']
export const ACCOUNT_NAME: Record<Net, string> = { bluesky: 'Bluesky', mastodon: 'Mastodon', linkedin: 'LinkedIn', x: 'X', telegram: 'Telegram', discord: 'Discord', devto: 'DEV' }

export type Field = { key: string; label: string; secret?: boolean; hint?: string; optional?: boolean }
/** What the person types to connect each network. Secrets go to the vault and never come back. */
export const ACCOUNT_FIELDS: Record<Net, Field[]> = {
  bluesky: [{ key: 'handle', label: 'Handle', hint: 'you.bsky.social' }, { key: 'password', label: 'App password', secret: true, hint: 'xxxx-xxxx-xxxx-xxxx' }, { key: 'pds', label: 'Server', hint: 'https://bsky.social', optional: true }],
  mastodon: [{ key: 'instance', label: 'Instance', hint: 'mastodon.social' }, { key: 'token', label: 'Access token', secret: true }, { key: 'limit', label: 'Character limit', hint: '500', optional: true }],
  linkedin: [{ key: 'token', label: 'Access token (openid, profile, w_member_social)', secret: true }],
  x: [{ key: 'consumerKey', label: 'API key', secret: true }, { key: 'consumerSecret', label: 'API key secret', secret: true }, { key: 'token', label: 'Access token', secret: true }, { key: 'tokenSecret', label: 'Access token secret', secret: true }, { key: 'userId', label: 'Numeric user id (for Mentions)', optional: true }],
  telegram: [{ key: 'bot', label: 'Bot token', secret: true, hint: '123456:ABC...' }, { key: 'chat', label: 'Chat id', hint: '@channel or -100...' }],
  discord: [{ key: 'webhook', label: 'Webhook URL', secret: true, hint: 'https://discord.com/api/webhooks/...' }],
  devto: [{ key: 'apiKey', label: 'API key', secret: true }],
}

export const DEFAULT_PDS = 'https://bsky.social'

/** The fields, trimmed and checked; missing required ones are refused. */
export function cleanFields(net: Net, raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of ACCOUNT_FIELDS[net]) {
    const v = String(raw?.[f.key] ?? '').trim().slice(0, 4000)
    if (!v && !f.optional) throw new Error(`${ACCOUNT_NAME[net]}: the ${f.label.toLowerCase()} is missing.`)
    if (v) out[f.key] = v
  }
  return out
}

/** The credential to save for every network but Bluesky, which signs in first (see blueskyLogin). */
export function credFromFields(net: Exclude<Net, 'bluesky'>, raw: Record<string, unknown>): Cred {
  const f = cleanFields(net, raw)
  switch (net) {
    case 'mastodon': {
      const limit = f.limit ? Math.round(Number(f.limit)) : 0
      if (f.limit && !(limit >= 100 && limit <= 100_000)) throw new Error('Mastodon: the character limit is a number like 500.')
      return { accessToken: f.token, ids: { server: new URL(httpsBase(f.instance, 'instance')).host, ...(limit ? { limit: String(limit) } : {}) } }
    }
    case 'linkedin':
      return { accessToken: f.token }
    case 'x':
      if (f.userId && !/^\d{1,30}$/.test(f.userId)) throw new Error('X: the user id is a number.')
      return { accessToken: '', keys: { consumerKey: f.consumerKey, consumerSecret: f.consumerSecret, token: f.token, tokenSecret: f.tokenSecret }, ...(f.userId ? { ids: { userId: f.userId } } : {}) }
    case 'telegram':
      if (!/^\d+:[\w-]+$/.test(f.bot)) throw new Error('That does not look like a bot token (123456:ABC...).')
      return { accessToken: f.bot, ids: { chat: f.chat } }
    case 'discord':
      if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(f.webhook)) throw new Error('A Discord webhook URL: https://discord.com/api/webhooks/...')
      return { accessToken: f.webhook }
    case 'devto':
      return { accessToken: f.apiKey }
  }
}

/** Bluesky: the handle, an app password (never the account password) and the server to sign in on. */
export function blueskyLogin(raw: Record<string, unknown>): { handle: string; password: string; pds: string } {
  const f = cleanFields('bluesky', raw)
  if (!/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(f.password)) throw new Error('Use an app password (xxxx-xxxx-xxxx-xxxx), not your account password.')
  return { handle: f.handle.replace(/^@/, ''), password: f.password, pds: httpsBase(f.pds || DEFAULT_PDS, 'Bluesky server') }
}

export const pdsOf = (c: Cred) => c.ids?.pds || DEFAULT_PDS
export const mastoLimit = (c: Cred | null) => (c?.ids?.limit ? Number(c.ids.limit) : undefined)

/** The host a connected network reaches, for the confirm step. */
export function hostOf(net: Net, c: Cred): string {
  if (net === 'bluesky') return new URL(pdsOf(c)).host
  if (net === 'mastodon') return c.ids?.server ?? '?'
  return { linkedin: 'api.linkedin.com', x: 'api.x.com', telegram: 'api.telegram.org', discord: 'discord.com', devto: 'dev.to' }[net]
}
