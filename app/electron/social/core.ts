// Social accounts: one shape for every network, so the window draws one interface. Credentials live
// in the vault (encrypted by the OS keychain) and are only ever read here, in the main process; the
// window sees account names, numbers and posts, never a token.

export type NetworkId = 'instagram' | 'facebook' | 'threads' | 'youtube' | 'linkedin' | 'x' | 'tiktok' | 'bluesky' | 'mastodon'

export type Cred = {
  accessToken: string
  refreshToken?: string
  /** ms epoch */
  expiresAt?: number
  clientId?: string
  clientSecret?: string
  /** ids the network needs besides the token (page id, Instagram user id, person urn...) */
  ids?: Record<string, string>
}

export type Profile = { id: string; name: string; handle?: string; avatar?: string; followers?: number; posts?: number; url?: string }
export type Post = { id: string; text: string; at: string; url?: string; media?: string; likes?: number; comments?: number; views?: number; shares?: number }
export type Comment = { id: string; author: string; text: string; at: string; replies?: number }
export type Draft = { text: string; mediaUrl?: string; mediaKind?: 'image' | 'video'; link?: string; title?: string }

export type Network = {
  id: NetworkId
  name: string
  /** what works through the official API with an ordinary account, said plainly */
  can: { read: boolean; comments: boolean; reply: boolean; publish: boolean; note?: string }
  profile: (c: Cred, f: Fetcher) => Promise<Profile>
  posts: (c: Cred, f: Fetcher) => Promise<Post[]>
  comments?: (c: Cred, f: Fetcher, postId: string) => Promise<Comment[]>
  reply?: (c: Cred, f: Fetcher, commentId: string, text: string, postId?: string) => Promise<void>
  publish?: (c: Cred, f: Fetcher, d: Draft) => Promise<{ id: string; url?: string }>
}

export type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<unknown>

/** A JSON fetch that turns API errors into readable ones and never puts the token in the message. */
export function makeFetcher(doFetch: typeof fetch, secrets: () => string[] = () => []): Fetcher {
  return async (url, init) => {
    const r = await doFetch(url, { method: init?.method ?? 'GET', headers: { Accept: 'application/json', ...(init?.headers ?? {}) }, body: init?.body })
    const text = await r.text()
    let j: unknown = null
    try {
      j = text ? JSON.parse(text) : null
    } catch {
      j = { raw: text.slice(0, 300) }
    }
    if (!r.ok) {
      const e = j as { error?: { message?: string } | string; error_description?: string; detail?: string; title?: string; message?: string }
      let msg = (typeof e?.error === 'object' ? e.error?.message : undefined) ?? e?.error_description ?? e?.detail ?? e?.message ?? e?.title ?? (typeof e?.error === 'string' ? e.error : '') ?? ''
      for (const s of secrets()) if (s) msg = msg.split(s).join('***')
      const host = new URL(url).host
      throw new Error(`${host} answered ${r.status}${msg ? `: ${msg}` : ''}`)
    }
    return j
  }
}

export const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
