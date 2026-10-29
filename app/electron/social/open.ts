// The open networks: Bluesky (AT Protocol) and Mastodon (any server). Both let an ordinary account
// read its home timeline through the API, so besides posting they give the app a feed of its own,
// drawn in the app's design. Bluesky signs in with an app password; Mastodon with a token the person
// creates on their server. Both live in the vault like the other networks.
import type { Comment, Cred, Draft, Fetcher, Network, Post, Profile } from './core.js'
import { blueskyLogin, credFromFields, DEFAULT_PDS, pdsOf } from '../../shared/accounts.js'
import { htmlText, linkFacets } from '../../shared/social.js'

export { htmlText, linkFacets }

export type FeedItem = {
  id: string
  author: { name: string; handle: string; avatar?: string }
  text: string
  at: string
  url?: string
  media?: string
  likes: number
  replies: number
  reposts: number
  liked: boolean
  reposted: boolean
  /** set when someone reposted it into the timeline */
  repostedBy?: string
}

const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/* ---------- Bluesky ---------- */

/** The account's own server (PDS); STM_BSKY_API points tests at a fake one. */
const host = (pds?: string) => process.env.STM_BSKY_API ?? pds ?? DEFAULT_PDS
const xrpc = (c: Cred | string, m: string, q?: Record<string, string>) => `${host(typeof c === 'string' ? c : pdsOf(c))}/xrpc/${m}${q ? `?${new URLSearchParams(q)}` : ''}`
const auth = (c: Cred) => ({ Authorization: `Bearer ${c.accessToken}` })

/**
 * Signs in with the handle and an app password, never the account password, on the account's own server.
 * Only the session is saved; the app password is not kept. Business pastes "handle password [server]".
 */
export async function bskySession(f: Fetcher, login: string | Record<string, unknown>): Promise<Cred> {
  const [handle, password, pds] = typeof login === 'string' ? login.trim().split(/\s+/) : []
  const l = blueskyLogin(typeof login === 'string' ? { handle, password, pds } : login)
  const s = (await f(xrpc(l.pds, 'com.atproto.server.createSession'), json({ identifier: l.handle, password: l.password }))) as { accessJwt: string; refreshJwt: string; did: string; handle: string }
  return { accessToken: s.accessJwt, refreshToken: s.refreshJwt, expiresAt: Date.now() + 90 * 60_000, ids: { did: s.did, handle: s.handle, ...(l.pds !== DEFAULT_PDS ? { pds: l.pds } : {}) } }
}

/** Bluesky's access token lasts about two hours; the refresh one gives a new pair. */
export async function bskyRefresh(f: Fetcher, c: Cred, now = Date.now()): Promise<Cred | null> {
  if (!c.refreshToken || (c.expiresAt && c.expiresAt - now > 120_000)) return null
  const s = (await f(xrpc(c, 'com.atproto.server.refreshSession'), { method: 'POST', headers: { Authorization: `Bearer ${c.refreshToken}` } })) as { accessJwt: string; refreshJwt: string }
  return { ...c, accessToken: s.accessJwt, refreshToken: s.refreshJwt, expiresAt: now + 90 * 60_000 }
}

type BPost = { uri: string; cid: string; author: { did: string; handle: string; displayName?: string; avatar?: string }; record: { text?: string; createdAt?: string; reply?: { root: { uri: string; cid: string } } }; likeCount?: number; replyCount?: number; repostCount?: number; viewer?: { like?: string; repost?: string }; embed?: { images?: { thumb?: string }[]; thumbnail?: string; external?: { thumb?: string } }; indexedAt?: string }

const rkey = (uri: string) => uri.split('/').pop() ?? ''
const bskyUrl = (p: BPost) => `https://bsky.app/profile/${p.author.handle}/post/${rkey(p.uri)}`
/** A post's id in the app: its uri and cid together, which likes, reposts and replies all need. */
const bid = (p: BPost) => `${p.uri}|${p.cid}`
export const splitBid = (id: string) => {
  const [uri, cid] = id.split('|')
  if (!uri?.startsWith('at://') || !cid || !/^[a-z0-9]+$/i.test(cid)) throw new Error('Not a Bluesky post.')
  return { uri, cid }
}

export function bskyItem(p: BPost, repostedBy?: string): FeedItem {
  return {
    id: bid(p),
    author: { name: p.author.displayName || p.author.handle, handle: `@${p.author.handle}`, avatar: p.author.avatar },
    text: p.record.text ?? '',
    at: p.record.createdAt ?? p.indexedAt ?? '',
    url: bskyUrl(p),
    media: p.embed?.images?.[0]?.thumb ?? p.embed?.thumbnail ?? p.embed?.external?.thumb,
    likes: p.likeCount ?? 0,
    replies: p.replyCount ?? 0,
    reposts: p.repostCount ?? 0,
    liked: Boolean(p.viewer?.like),
    reposted: Boolean(p.viewer?.repost),
    repostedBy,
  }
}

async function bskyCreate(c: Cred, f: Fetcher, collection: string, record: object) {
  return (await f(xrpc(c, 'com.atproto.repo.createRecord'), { ...json({ repo: c.ids?.did, collection, record }), headers: { 'Content-Type': 'application/json', ...auth(c) } })) as { uri: string; cid: string }
}

/** A mention or a reply to the account, for the one inbox: the thread is the conversation's root. */
export type Mention = { id: string; thread: string; author: { name: string; handle: string }; text: string; at: string; url?: string; unread: boolean }

export const bluesky: Network & {
  timeline: (c: Cred, f: Fetcher) => Promise<FeedItem[]>
  mentions: (c: Cred, f: Fetcher) => Promise<Mention[]>
  like: (c: Cred, f: Fetcher, id: string) => Promise<void>
  repost: (c: Cred, f: Fetcher, id: string) => Promise<void>
} = {
  id: 'bluesky',
  name: 'Bluesky',
  can: { read: true, comments: true, reply: true, publish: true, note: 'Signs in with an app password. Posts up to 300 characters; links become clickable.' },
  async profile(c, f): Promise<Profile> {
    const p = (await f(xrpc(c, 'app.bsky.actor.getProfile', { actor: c.ids!.did! }), { headers: auth(c) })) as { did: string; handle: string; displayName?: string; avatar?: string; followersCount?: number; postsCount?: number }
    return { id: p.did, name: p.displayName || p.handle, handle: `@${p.handle}`, avatar: p.avatar, followers: p.followersCount, posts: p.postsCount, url: `https://bsky.app/profile/${p.handle}` }
  },
  async posts(c, f): Promise<Post[]> {
    const j = (await f(xrpc(c, 'app.bsky.feed.getAuthorFeed', { actor: c.ids!.did!, limit: '25', filter: 'posts_no_replies' }), { headers: auth(c) })) as { feed: { post: BPost }[] }
    return j.feed.map(({ post: p }) => ({ id: bid(p), text: p.record.text ?? '', at: p.record.createdAt ?? '', url: bskyUrl(p), media: p.embed?.images?.[0]?.thumb, likes: p.likeCount, comments: p.replyCount, shares: p.repostCount }))
  },
  async comments(c, f, postId): Promise<Comment[]> {
    const j = (await f(xrpc(c, 'app.bsky.feed.getPostThread', { uri: splitBid(postId).uri, depth: '1' }), { headers: auth(c) })) as { thread: { replies?: { post?: BPost }[] } }
    return (j.thread.replies ?? []).filter((r) => r.post).map(({ post: p }) => ({ id: bid(p!), author: `@${p!.author.handle}`, text: p!.record.text ?? '', at: p!.record.createdAt ?? '', replies: p!.replyCount ?? 0 }))
  },
  async reply(c, f, commentId, text) {
    const parent = splitBid(commentId)
    const j = (await f(xrpc(c, 'app.bsky.feed.getPosts', { uris: parent.uri }), { headers: auth(c) })) as { posts: BPost[] }
    const root = j.posts[0]?.record.reply?.root ?? parent
    await bskyCreate(c, f, 'app.bsky.feed.post', { $type: 'app.bsky.feed.post', text, facets: linkFacets(text), createdAt: new Date().toISOString(), reply: { root, parent } })
  },
  async publish(c, f, d: Draft) {
    const text = d.link && !d.text.includes(d.link) ? `${d.text} ${d.link}`.trim() : d.text
    const r = await bskyCreate(c, f, 'app.bsky.feed.post', { $type: 'app.bsky.feed.post', text, facets: linkFacets(text), createdAt: new Date().toISOString() })
    return { id: r.uri, url: `https://bsky.app/profile/${c.ids?.handle}/post/${rkey(r.uri)}` }
  },
  async timeline(c, f) {
    const j = (await f(xrpc(c, 'app.bsky.feed.getTimeline', { limit: '40' }), { headers: auth(c) })) as { feed: { post: BPost; reason?: { $type?: string; by?: { handle: string; displayName?: string } } }[] }
    return j.feed.map((x) => bskyItem(x.post, x.reason?.$type?.endsWith('reasonRepost') ? (x.reason.by?.displayName || x.reason.by?.handle) : undefined))
  },
  async mentions(c, f) {
    type BNote = { uri: string; cid: string; reason: string; isRead?: boolean; indexedAt: string; author: { handle: string; displayName?: string }; record: { text?: string; createdAt?: string; reply?: { root?: { uri: string } } } }
    const j = (await f(xrpc(c, 'app.bsky.notification.listNotifications', { limit: '50' }), { headers: auth(c) })) as { notifications: BNote[] }
    return j.notifications
      .filter((n) => ['mention', 'reply', 'quote'].includes(n.reason))
      .map((n) => ({ id: `${n.uri}|${n.cid}`, thread: n.record.reply?.root?.uri ?? n.uri, author: { name: n.author.displayName || n.author.handle, handle: `@${n.author.handle}` }, text: n.record.text ?? '', at: n.record.createdAt ?? n.indexedAt, url: `https://bsky.app/profile/${n.author.handle}/post/${rkey(n.uri)}`, unread: !n.isRead }))
  },
  async like(c, f, id) {
    await bskyCreate(c, f, 'app.bsky.feed.like', { $type: 'app.bsky.feed.like', subject: splitBid(id), createdAt: new Date().toISOString() })
  },
  async repost(c, f, id) {
    await bskyCreate(c, f, 'app.bsky.feed.repost', { $type: 'app.bsky.feed.repost', subject: splitBid(id), createdAt: new Date().toISOString() })
  },
}

/* ---------- Mastodon ---------- */

/** "mastodon.social TOKEN": the server and a token made under Preferences, Development. */
export function mastoCred(token: string): Cred {
  const [instance, t] = token.trim().split(/\s+/)
  return credFromFields('mastodon', { instance, token: t })
}
const mbase = (c: Cred) => `${process.env.STM_MASTO_API ?? `https://${c.ids!.server}`}/api`
const mauth = (c: Cred) => ({ Authorization: `Bearer ${c.accessToken}` })

type MStatus = { id: string; created_at: string; content: string; url?: string; uri?: string; account: { acct: string; display_name?: string; avatar?: string }; favourites_count?: number; replies_count?: number; reblogs_count?: number; favourited?: boolean; reblogged?: boolean; media_attachments?: { preview_url?: string }[]; reblog?: MStatus | null; in_reply_to_id?: string | null }

export function mastoItem(s: MStatus): FeedItem {
  const o = s.reblog ?? s
  return {
    id: o.id,
    author: { name: o.account.display_name || o.account.acct, handle: `@${o.account.acct}`, avatar: o.account.avatar },
    text: htmlText(o.content),
    at: o.created_at,
    url: o.url ?? o.uri,
    media: o.media_attachments?.[0]?.preview_url,
    likes: o.favourites_count ?? 0,
    replies: o.replies_count ?? 0,
    reposts: o.reblogs_count ?? 0,
    liked: Boolean(o.favourited),
    reposted: Boolean(o.reblogged),
    repostedBy: s.reblog ? s.account.display_name || s.account.acct : undefined,
  }
}
const mid = (id: string) => {
  if (!/^[0-9A-Za-z]{1,40}$/.test(id)) throw new Error('Not a Mastodon post.')
  return id
}

export const mastodon: typeof bluesky = {
  id: 'mastodon',
  name: 'Mastodon',
  can: { read: true, comments: true, reply: true, publish: true, note: 'Any Mastodon server. Text posts and links; photos are not sent yet.' },
  async profile(c, f) {
    const a = (await f(`${mbase(c)}/v1/accounts/verify_credentials`, { headers: mauth(c) })) as { id: string; acct: string; display_name?: string; avatar?: string; followers_count?: number; statuses_count?: number; url?: string }
    return { id: a.id, name: a.display_name || a.acct, handle: `@${a.acct}@${c.ids!.server}`, avatar: a.avatar, followers: a.followers_count, posts: a.statuses_count, url: a.url }
  },
  async posts(c, f) {
    const me = (await f(`${mbase(c)}/v1/accounts/verify_credentials`, { headers: mauth(c) })) as { id: string }
    const list = (await f(`${mbase(c)}/v1/accounts/${mid(me.id)}/statuses?limit=25&exclude_replies=true&exclude_reblogs=true`, { headers: mauth(c) })) as MStatus[]
    return list.map((s) => ({ id: s.id, text: htmlText(s.content), at: s.created_at, url: s.url, media: s.media_attachments?.[0]?.preview_url, likes: s.favourites_count, comments: s.replies_count, shares: s.reblogs_count }))
  },
  async comments(c, f, postId) {
    const ctx = (await f(`${mbase(c)}/v1/statuses/${mid(postId)}/context`, { headers: mauth(c) })) as { descendants: MStatus[] }
    return ctx.descendants.filter((s) => s.in_reply_to_id === postId).map((s) => ({ id: s.id, author: `@${s.account.acct}`, text: htmlText(s.content), at: s.created_at, replies: s.replies_count ?? 0 }))
  },
  async reply(c, f, commentId, text) {
    const to = (await f(`${mbase(c)}/v1/statuses/${mid(commentId)}`, { headers: mauth(c) })) as MStatus
    const mention = `@${to.account.acct}`
    await f(`${mbase(c)}/v1/statuses`, { ...json({ status: text.includes(mention) ? text : `${mention} ${text}`, in_reply_to_id: commentId }), headers: { 'Content-Type': 'application/json', ...mauth(c) } })
  },
  async publish(c, f, d) {
    const status = d.link && !d.text.includes(d.link) ? `${d.text} ${d.link}`.trim() : d.text
    const s = (await f(`${mbase(c)}/v1/statuses`, { ...json({ status }), headers: { 'Content-Type': 'application/json', ...mauth(c) } })) as MStatus
    return { id: s.id, url: s.url }
  },
  async timeline(c, f) {
    return ((await f(`${mbase(c)}/v1/timelines/home?limit=40`, { headers: mauth(c) })) as MStatus[]).map(mastoItem)
  },
  async mentions(c, f) {
    type MNote = { id: string; type: string; created_at: string; status?: MStatus & { in_reply_to_id?: string | null }; account: { acct: string; display_name?: string } }
    const list = (await f(`${mbase(c)}/v1/notifications?types[]=mention&limit=40`, { headers: mauth(c) })) as MNote[]
    return list
      .filter((n) => n.type === 'mention' && n.status)
      .map((n) => ({ id: n.status!.id, thread: n.status!.in_reply_to_id ?? n.status!.id, author: { name: n.account.display_name || n.account.acct, handle: `@${n.account.acct}` }, text: htmlText(n.status!.content), at: n.status!.created_at, url: n.status!.url, unread: true }))
  },
  async like(c, f, id) {
    await f(`${mbase(c)}/v1/statuses/${mid(id)}/favourite`, { method: 'POST', headers: mauth(c) })
  },
  async repost(c, f, id) {
    await f(`${mbase(c)}/v1/statuses/${mid(id)}/reblog`, { method: 'POST', headers: mauth(c) })
  },
}
