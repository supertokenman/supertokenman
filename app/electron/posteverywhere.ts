// Post everywhere in the main process. Credentials are the shared social accounts (SOCIAL_<NET> in the
// vault, see social/store.ts); the window sees only which networks are connected. Nothing runs until
// the person presses Post and confirms; each call goes straight to that network's own API.
import { randomBytes } from 'node:crypto'
import type { IpcMain } from 'electron'
import { ACCOUNTS, mastoLimit, pdsOf, type Cred } from '../shared/accounts.js'
import * as P from '../shared/posteverywhere.js'
import { bskyRecord, bskyWebUrl, mastoStatus, X_TWEETS, xTweet, type Net, type Req } from '../shared/social.js'
import { secretsOf } from './social/store.js'
import { xAuth } from './social/networks.js'

async function call(r: Req): Promise<{ j: Record<string, unknown>; h: Headers }> {
  const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body, signal: AbortSignal.timeout(30_000) })
  const t = await res.text()
  let j: Record<string, unknown> = {}
  try {
    j = t ? JSON.parse(t) : {}
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const m = j.error_description ?? j.message ?? j.error ?? j.detail ?? j.description ?? (typeof j.errors === 'object' ? JSON.stringify(j.errors) : t.slice(0, 300))
    throw new Error(`${res.status}: ${typeof m === 'string' ? m : JSON.stringify(m)}`.slice(0, 400))
  }
  return { j, h: res.headers }
}

async function send(net: Net, c: Cred, text: string, title: string): Promise<string | undefined> {
  switch (net) {
    case 'bluesky': {
      const r = (await call(bskyRecord(pdsOf(c), c.accessToken, c.ids?.did ?? '', text, new Date().toISOString()))).j as { uri: string }
      return bskyWebUrl(c.ids?.handle ?? '', r.uri)
    }
    case 'mastodon':
      return (await call(mastoStatus(c.ids?.server ?? '', c.accessToken, text, randomBytes(12).toString('hex')))).j.url as string | undefined
    case 'linkedin': {
      const sub = c.ids?.person ?? ((await call(P.linkedinMe(c))).j.sub as string)
      if (!sub) throw new Error('LinkedIn did not say who this token belongs to (it needs the openid and profile scopes).')
      const urn = (await call(P.linkedinPost(c, sub, text))).h.get('x-restli-id')
      return urn ? P.linkedinUrl(urn) : undefined
    }
    case 'x': {
      const id = ((await call(xTweet(text, xAuth(c, 'POST', X_TWEETS)))).j.data as { id?: string } | undefined)?.id
      return id ? `https://x.com/i/web/status/${id}` : undefined
    }
    case 'telegram': {
      const id = ((await call(P.telegramPost(c, text))).j.result as { message_id?: number } | undefined)?.message_id
      return id ? (P.telegramUrl(c.ids?.chat ?? '', id) ?? undefined) : undefined
    }
    case 'discord':
      return P.discordUrl((await call(P.discordPost(c, text))).j as { id?: string }) ?? undefined
    case 'devto':
      return (await call(P.devtoPost(c, title, text))).j.url as string | undefined
  }
}

export function registerPostEverywhere(ipcMain: IpcMain, account: (n: Net) => Promise<Cred | null>) {
  const okNet = (n: unknown): Net => {
    if (!ACCOUNTS.includes(n as Net)) throw new Error('Unknown network.')
    return n as Net
  }
  ipcMain.handle('post:send', async (_e, nets: unknown, text: unknown, title: unknown) => {
    const t = String(text ?? '').trim()
    const ti = String(title ?? '')
    const list = (Array.isArray(nets) ? nets : []).map(okNet)
    return Promise.all(list.map(async (n): Promise<P.Result> => {
      const c = await account(n).catch(() => null)
      if (!c) return { net: n, ok: false, error: 'Not connected.' }
      const p = P.preview(n, t, ti, n === 'mastodon' ? (mastoLimit(c) ?? undefined) : undefined)
      if (!p.ok) return { net: n, ok: false, error: p.problem }
      try {
        return { net: n, ok: true, url: await send(n, c, t, ti) }
      } catch (e) {
        // the error text only, every secret masked; never the request, which carries the credential
        let m = (e as Error).message
        for (const s of secretsOf(c)) m = m.split(s).join('…')
        return { net: n, ok: false, error: m }
      }
    }))
  })
}
