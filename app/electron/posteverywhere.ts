// Post everywhere in the main process: credentials in the vault, the window sees only which networks
// are connected. Nothing runs until the person presses Post and confirms; each call goes straight to
// that network's own API.
import { createHmac, randomBytes } from 'node:crypto'
import type { IpcMain } from 'electron'
import * as P from '../shared/posteverywhere.js'

type VaultLike = { get(n: string): string | undefined; set(n: string, v: string): void; delete(n: string): void }
const vname = (n: P.NetId) => `POST_EVERYWHERE_${n.toUpperCase()}`
const hmac = (k: string, d: string) => createHmac('sha1', k).update(d).digest('base64')

async function call(r: P.Req): Promise<{ j: Record<string, unknown>; h: Headers }> {
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

async function send(net: P.NetId, c: P.Creds, text: string, title: string): Promise<string | undefined> {
  switch (net) {
    case 'bluesky': {
      const s = (await call(P.bskySession(c))).j as { accessJwt: string; did: string; handle: string }
      const r = (await call(P.bskyPost(c, s, text, new Date().toISOString()))).j as { uri: string }
      return P.bskyUrl(s.handle || c.handle, r.uri)
    }
    case 'mastodon':
      return (await call(P.mastoPost(c, text, randomBytes(12).toString('hex')))).j.url as string | undefined
    case 'linkedin': {
      const sub = (await call(P.linkedinMe(c))).j.sub as string
      if (!sub) throw new Error('LinkedIn did not say who this token belongs to (it needs the openid and profile scopes).')
      const urn = (await call(P.linkedinPost(c, sub, text))).h.get('x-restli-id')
      return urn ? P.linkedinUrl(urn) : undefined
    }
    case 'x': {
      const id = ((await call(P.xPost(c, text, randomBytes(16).toString('hex'), String(Math.floor(Date.now() / 1000)), hmac))).j.data as { id?: string } | undefined)?.id
      return id ? `https://x.com/i/web/status/${id}` : undefined
    }
    case 'telegram': {
      const id = ((await call(P.telegramPost(c, text))).j.result as { message_id?: number } | undefined)?.message_id
      return id ? (P.telegramUrl(c.chat, id) ?? undefined) : undefined
    }
    case 'discord':
      return P.discordUrl((await call(P.discordPost(c, text))).j as { id?: string }) ?? undefined
    case 'devto':
      return (await call(P.devtoPost(c, title, text))).j.url as string | undefined
  }
}

export function registerPostEverywhere(ipcMain: IpcMain, vault: () => VaultLike | undefined) {
  const v = () => {
    const x = vault()
    if (!x) throw new Error('The vault is not open yet.')
    return x
  }
  const creds = (n: P.NetId): P.Creds | null => {
    try {
      return JSON.parse(v().get(vname(n)) ?? 'null')
    } catch {
      return null
    }
  }
  const okNet = (n: unknown): P.NetId => {
    if (!P.NETS.includes(n as P.NetId)) throw new Error('Unknown network.')
    return n as P.NetId
  }
  // never the credentials: connected or not, and the host each would reach
  const status = () => P.NETS.map((n) => {
    const c = creds(n)
    return { net: n, connected: !!c, host: c ? P.hostOf(n, c) : null, mastodonLimit: n === 'mastodon' && c?.limit ? Number(c.limit) : undefined }
  })
  ipcMain.handle('post:status', () => status())
  ipcMain.handle('post:connect', (_e, net: unknown, fields: Record<string, unknown>) => {
    const n = okNet(net)
    const c: P.Creds = {}
    for (const f of P.NET_FIELDS[n]) c[f.key] = String(fields?.[f.key] ?? '').trim().slice(0, 4000)
    // a dry build checks the shape before anything is saved; nothing is sent
    if (n === 'bluesky') P.bskySession(c)
    else if (n === 'mastodon') P.mastoPost(c, 'x', 'k')
    else if (n === 'linkedin') P.linkedinMe(c)
    else if (n === 'x') P.xPost(c, 'x', 'n', '0', hmac)
    else if (n === 'telegram') P.telegramPost(c, 'x')
    else if (n === 'discord') P.discordPost(c, 'x')
    else P.devtoPost(c, 'x', 'x')
    v().set(vname(n), JSON.stringify(c))
    return status()
  })
  ipcMain.handle('post:disconnect', (_e, net: unknown) => {
    v().delete(vname(okNet(net)))
    return status()
  })
  ipcMain.handle('post:send', async (_e, nets: unknown, text: unknown, title: unknown) => {
    const t = String(text ?? '').trim()
    const ti = String(title ?? '')
    const list = (Array.isArray(nets) ? nets : []).map(okNet)
    return Promise.all(list.map(async (n): Promise<P.Result> => {
      const c = creds(n)
      if (!c) return { net: n, ok: false, error: 'Not connected.' }
      const p = P.preview(n, t, ti)
      if (!p.ok) return { net: n, ok: false, error: p.problem }
      try {
        return { net: n, ok: true, url: await send(n, c, t, ti) }
      } catch (e) {
        // the error text only; never the request, which carries the credential
        return { net: n, ok: false, error: (e as Error).message.replaceAll(c.bot || '\u0000', '…') }
      }
    }))
  })
}
