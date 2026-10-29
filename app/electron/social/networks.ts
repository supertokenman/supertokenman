// The networks, each through its official API. Every call takes the saved credential and a fetcher,
// so tests run them against recorded answers and nothing here touches the disk or the vault.
import type { Comment, Cred, Draft, Fetcher, Network, NetworkId, Post, Profile } from './core.js'
import { qs } from './core.js'
import { createHmac, randomBytes } from 'node:crypto'
import { authHeader } from '../../shared/oauth1.js'
import { LINKEDIN_VERSION } from '../../shared/posteverywhere.js'
import { X_TWEETS, xTweet } from '../../shared/social.js'
import type { OAuthSpec } from './oauth.js'
import { bluesky, mastodon } from './open.js'

const GRAPH = 'https://graph.facebook.com/v21.0'
const THREADS = 'https://graph.threads.net/v1.0'
const bearer = (c: Cred) => ({ Authorization: `Bearer ${c.accessToken}` })
const need = (c: Cred, k: string) => {
  const v = c.ids?.[k]
  if (!v) throw new Error(`Connect again: the ${k} is missing.`)
  return v
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ---------- Meta: Instagram (business or creator account, through its Facebook Page) ---------- */

type IgMedia = { id: string; caption?: string; timestamp: string; permalink?: string; media_url?: string; thumbnail_url?: string; like_count?: number; comments_count?: number }

const instagram: Network = {
  id: 'instagram',
  name: 'Instagram',
  can: { read: true, comments: true, reply: true, publish: true, note: 'Business or Creator account linked to a Facebook Page. Photos and Reels go up from a public link.' },
  async profile(c, f) {
    const ig = need(c, 'igUser')
    const j = (await f(`${GRAPH}/${ig}?${qs({ fields: 'username,name,followers_count,media_count,profile_picture_url', access_token: c.accessToken })}`)) as { username: string; name?: string; followers_count?: number; media_count?: number; profile_picture_url?: string }
    return { id: ig, name: j.name || j.username, handle: `@${j.username}`, avatar: j.profile_picture_url, followers: j.followers_count, posts: j.media_count, url: `https://instagram.com/${j.username}` }
  },
  async posts(c, f) {
    const j = (await f(`${GRAPH}/${need(c, 'igUser')}/media?${qs({ fields: 'id,caption,timestamp,permalink,media_url,thumbnail_url,like_count,comments_count', limit: 24, access_token: c.accessToken })}`)) as { data: IgMedia[] }
    return j.data.map((m) => ({ id: m.id, text: m.caption ?? '', at: m.timestamp, url: m.permalink, media: m.thumbnail_url ?? m.media_url, likes: m.like_count, comments: m.comments_count }))
  },
  async comments(c, f, postId) {
    const j = (await f(`${GRAPH}/${postId}/comments?${qs({ fields: 'id,text,username,timestamp,replies{id}', limit: 50, access_token: c.accessToken })}`)) as { data: { id: string; text: string; username?: string; timestamp: string; replies?: { data: unknown[] } }[] }
    return j.data.map((x) => ({ id: x.id, author: x.username ? `@${x.username}` : 'someone', text: x.text, at: x.timestamp, replies: x.replies?.data.length ?? 0 }))
  },
  async reply(c, f, commentId, text) {
    await f(`${GRAPH}/${commentId}/replies?${qs({ message: text, access_token: c.accessToken })}`, { method: 'POST' })
  },
  async publish(c, f, d) {
    const ig = need(c, 'igUser')
    if (!d.mediaUrl) throw new Error('Instagram needs a photo or a video: add its public link.')
    const video = d.mediaKind === 'video'
    const made = (await f(`${GRAPH}/${ig}/media?${qs({ [video ? 'video_url' : 'image_url']: d.mediaUrl, media_type: video ? 'REELS' : undefined, caption: d.text, access_token: c.accessToken })}`, { method: 'POST' })) as { id: string }
    // a video is processed first; wait for it (up to ~3 minutes)
    if (video)
      for (let i = 0; i < 36; i++) {
        const s = (await f(`${GRAPH}/${made.id}?${qs({ fields: 'status_code', access_token: c.accessToken })}`)) as { status_code?: string }
        if (s.status_code === 'FINISHED') break
        if (s.status_code === 'ERROR') throw new Error('Instagram could not process the video.')
        await sleep(5000)
      }
    const pub = (await f(`${GRAPH}/${ig}/media_publish?${qs({ creation_id: made.id, access_token: c.accessToken })}`, { method: 'POST' })) as { id: string }
    const link = (await f(`${GRAPH}/${pub.id}?${qs({ fields: 'permalink', access_token: c.accessToken })}`).catch(() => ({}))) as { permalink?: string }
    return { id: pub.id, url: link.permalink }
  },
}

/* ---------- Meta: Facebook Page ---------- */

const facebook: Network = {
  id: 'facebook',
  name: 'Facebook Page',
  can: { read: true, comments: true, reply: true, publish: true, note: 'A Page you manage. Text, links and photos.' },
  async profile(c, f) {
    const page = need(c, 'page')
    const j = (await f(`${GRAPH}/${page}?${qs({ fields: 'name,username,followers_count,fan_count,link,picture{url}', access_token: c.accessToken })}`)) as { name: string; username?: string; followers_count?: number; fan_count?: number; link?: string; picture?: { data?: { url?: string } } }
    return { id: page, name: j.name, handle: j.username ? `@${j.username}` : undefined, followers: j.followers_count ?? j.fan_count, avatar: j.picture?.data?.url, url: j.link }
  },
  async posts(c, f) {
    const j = (await f(`${GRAPH}/${need(c, 'page')}/posts?${qs({ fields: 'id,message,created_time,permalink_url,full_picture,shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)', limit: 24, access_token: c.accessToken })}`)) as {
      data: { id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string; shares?: { count: number }; comments?: { summary?: { total_count: number } }; reactions?: { summary?: { total_count: number } } }[]
    }
    return j.data.map((p) => ({ id: p.id, text: p.message ?? '', at: p.created_time, url: p.permalink_url, media: p.full_picture, likes: p.reactions?.summary?.total_count, comments: p.comments?.summary?.total_count, shares: p.shares?.count }))
  },
  async comments(c, f, postId) {
    const j = (await f(`${GRAPH}/${postId}/comments?${qs({ fields: 'id,message,from{name},created_time,comment_count', limit: 50, access_token: c.accessToken })}`)) as { data: { id: string; message: string; from?: { name: string }; created_time: string; comment_count?: number }[] }
    return j.data.map((x) => ({ id: x.id, author: x.from?.name ?? 'someone', text: x.message, at: x.created_time, replies: x.comment_count }))
  },
  async reply(c, f, commentId, text) {
    await f(`${GRAPH}/${commentId}/comments?${qs({ message: text, access_token: c.accessToken })}`, { method: 'POST' })
  },
  async publish(c, f, d) {
    const page = need(c, 'page')
    if (d.mediaUrl && d.mediaKind !== 'video') {
      const j = (await f(`${GRAPH}/${page}/photos?${qs({ url: d.mediaUrl, caption: d.text, access_token: c.accessToken })}`, { method: 'POST' })) as { post_id?: string; id: string }
      return { id: j.post_id ?? j.id, url: `https://facebook.com/${j.post_id ?? j.id}` }
    }
    const j = (await f(`${GRAPH}/${page}/feed?${qs({ message: d.text, link: d.link, access_token: c.accessToken })}`, { method: 'POST' })) as { id: string }
    return { id: j.id, url: `https://facebook.com/${j.id}` }
  },
}

/* ---------- Threads ---------- */

const threads: Network = {
  id: 'threads',
  name: 'Threads',
  can: { read: true, comments: true, reply: true, publish: true, note: 'Text, a photo or a video from a public link.' },
  async profile(c, f) {
    const j = (await f(`${THREADS}/me?${qs({ fields: 'id,username,name,threads_profile_picture_url', access_token: c.accessToken })}`)) as { id: string; username: string; name?: string; threads_profile_picture_url?: string }
    return { id: j.id, name: j.name || j.username, handle: `@${j.username}`, avatar: j.threads_profile_picture_url, url: `https://www.threads.net/@${j.username}` }
  },
  async posts(c, f) {
    const j = (await f(`${THREADS}/me/threads?${qs({ fields: 'id,text,timestamp,permalink,media_url,thumbnail_url', limit: 24, access_token: c.accessToken })}`)) as { data: { id: string; text?: string; timestamp: string; permalink?: string; media_url?: string; thumbnail_url?: string }[] }
    return j.data.map((t) => ({ id: t.id, text: t.text ?? '', at: t.timestamp, url: t.permalink, media: t.thumbnail_url ?? t.media_url }))
  },
  async comments(c, f, postId) {
    const j = (await f(`${THREADS}/${postId}/replies?${qs({ fields: 'id,text,username,timestamp', access_token: c.accessToken })}`)) as { data: { id: string; text?: string; username?: string; timestamp: string }[] }
    return j.data.map((x) => ({ id: x.id, author: x.username ? `@${x.username}` : 'someone', text: x.text ?? '', at: x.timestamp }))
  },
  async reply(c, f, commentId, text) {
    const made = (await f(`${THREADS}/me/threads?${qs({ media_type: 'TEXT', text, reply_to_id: commentId, access_token: c.accessToken })}`, { method: 'POST' })) as { id: string }
    await f(`${THREADS}/me/threads_publish?${qs({ creation_id: made.id, access_token: c.accessToken })}`, { method: 'POST' })
  },
  async publish(c, f, d) {
    const kind = d.mediaUrl ? (d.mediaKind === 'video' ? 'VIDEO' : 'IMAGE') : 'TEXT'
    const made = (await f(`${THREADS}/me/threads?${qs({ media_type: kind, text: d.text, image_url: kind === 'IMAGE' ? d.mediaUrl : undefined, video_url: kind === 'VIDEO' ? d.mediaUrl : undefined, access_token: c.accessToken })}`, { method: 'POST' })) as { id: string }
    if (kind !== 'TEXT') await sleep(kind === 'VIDEO' ? 30_000 : 5_000)
    const pub = (await f(`${THREADS}/me/threads_publish?${qs({ creation_id: made.id, access_token: c.accessToken })}`, { method: 'POST' })) as { id: string }
    const link = (await f(`${THREADS}/${pub.id}?${qs({ fields: 'permalink', access_token: c.accessToken })}`).catch(() => ({}))) as { permalink?: string }
    return { id: pub.id, url: link.permalink }
  },
}

/* ---------- YouTube ---------- */

const YT = 'https://www.googleapis.com/youtube/v3'
const youtube: Network = {
  id: 'youtube',
  name: 'YouTube',
  can: { read: true, comments: true, reply: true, publish: false, note: 'Channel numbers, videos and comments. Uploading stays in YouTube Studio for now.' },
  async profile(c, f) {
    const j = (await f(`${YT}/channels?${qs({ part: 'snippet,statistics,contentDetails', mine: 'true' })}`, { headers: bearer(c) })) as { items: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } }; statistics: { subscriberCount?: string; videoCount?: string } }[] }
    const ch = j.items[0]
    if (!ch) throw new Error('This Google account has no YouTube channel.')
    return { id: ch.id, name: ch.snippet.title, handle: ch.snippet.customUrl, avatar: ch.snippet.thumbnails?.default?.url, followers: Number(ch.statistics.subscriberCount ?? 0), posts: Number(ch.statistics.videoCount ?? 0), url: `https://youtube.com/channel/${ch.id}` }
  },
  async posts(c, f) {
    const ch = (await f(`${YT}/channels?${qs({ part: 'contentDetails', mine: 'true' })}`, { headers: bearer(c) })) as { items: { contentDetails: { relatedPlaylists: { uploads: string } } }[] }
    const uploads = ch.items[0]?.contentDetails.relatedPlaylists.uploads
    if (!uploads) return []
    const list = (await f(`${YT}/playlistItems?${qs({ part: 'contentDetails', playlistId: uploads, maxResults: 24 })}`, { headers: bearer(c) })) as { items: { contentDetails: { videoId: string } }[] }
    const ids = list.items.map((i) => i.contentDetails.videoId)
    if (!ids.length) return []
    const v = (await f(`${YT}/videos?${qs({ part: 'snippet,statistics', id: ids.join(',') })}`, { headers: bearer(c) })) as { items: { id: string; snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string } } }; statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }
    return v.items.map((x) => ({ id: x.id, text: x.snippet.title, at: x.snippet.publishedAt, url: `https://youtu.be/${x.id}`, media: x.snippet.thumbnails?.medium?.url, views: Number(x.statistics.viewCount ?? 0), likes: Number(x.statistics.likeCount ?? 0), comments: Number(x.statistics.commentCount ?? 0) }))
  },
  async comments(c, f, postId) {
    const j = (await f(`${YT}/commentThreads?${qs({ part: 'snippet', videoId: postId, maxResults: 50, order: 'time' })}`, { headers: bearer(c) })) as { items: { snippet: { topLevelComment: { id: string; snippet: { authorDisplayName: string; textOriginal: string; publishedAt: string } }; totalReplyCount: number } }[] }
    return j.items.map((t) => ({ id: t.snippet.topLevelComment.id, author: t.snippet.topLevelComment.snippet.authorDisplayName, text: t.snippet.topLevelComment.snippet.textOriginal, at: t.snippet.topLevelComment.snippet.publishedAt, replies: t.snippet.totalReplyCount }))
  },
  async reply(c, f, commentId, text) {
    await f(`${YT}/comments?part=snippet`, { method: 'POST', headers: { ...bearer(c), 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }) })
  },
}

/* ---------- LinkedIn (your own profile; Company Pages need LinkedIn's approval) ---------- */

const linkedin: Network = {
  id: 'linkedin',
  name: 'LinkedIn',
  can: { read: false, comments: false, reply: false, publish: true, note: 'Posts to your profile. Reading posts, numbers and Company Pages needs LinkedIn’s partner approval.' },
  async profile(c, f) {
    const j = (await f('https://api.linkedin.com/v2/userinfo', { headers: bearer(c) })) as { sub: string; name: string; picture?: string }
    return { id: j.sub, name: j.name, avatar: j.picture, url: 'https://www.linkedin.com/in/me' }
  },
  async posts() {
    return []
  },
  async publish(c, f, d) {
    const sub = c.ids?.person ?? ((await f('https://api.linkedin.com/v2/userinfo', { headers: bearer(c) })) as { sub: string }).sub
    const body = {
      author: `urn:li:person:${sub}`,
      commentary: d.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
      ...(d.link ? { content: { article: { source: d.link, title: d.title ?? d.link } } } : {}),
    }
    await f('https://api.linkedin.com/rest/posts', { method: 'POST', headers: { ...bearer(c), 'Content-Type': 'application/json', 'LinkedIn-Version': LINKEDIN_VERSION, 'X-Restli-Protocol-Version': '2.0.0' }, body: JSON.stringify(body) })
    return { id: 'posted', url: 'https://www.linkedin.com/in/me/recent-activity/all/' }
  },
}

/* ---------- X ---------- */

/** X: OAuth 1.0a with the person's four keys when they pasted them, else the OAuth 2 token from signing in. */
export function xAuth(c: Cred, method: string, url: string): string {
  const k = c.keys
  if (!k?.consumerKey) return `Bearer ${c.accessToken}`
  const hmac = (key: string, t: string) => createHmac('sha1', key).update(t).digest('base64')
  return authHeader(method, url, { consumerKey: k.consumerKey, consumerSecret: k.consumerSecret, token: k.token, tokenSecret: k.tokenSecret }, hmac, { nonce: randomBytes(16).toString('hex'), timestamp: Math.floor(Date.now() / 1000) })
}
const xGet = (c: Cred, f: Fetcher, url: string) => f(url, { headers: { Authorization: xAuth(c, 'GET', url) } })
const xSend = async (c: Cred, f: Fetcher, text: string, inReplyTo?: string) => {
  const r = xTweet(text, xAuth(c, 'POST', X_TWEETS), inReplyTo)
  return (await f(r.url, r)) as { data: { id: string } }
}

const x: Network = {
  id: 'x',
  name: 'X',
  can: { read: true, comments: false, reply: true, publish: true, note: 'The free API tier allows posting and your profile; reading timelines and mentions needs a paid tier.' },
  async profile(c, f) {
    const j = (await xGet(c, f, 'https://api.x.com/2/users/me?user.fields=public_metrics,profile_image_url')) as { data: { id: string; name: string; username: string; profile_image_url?: string; public_metrics?: { followers_count: number; tweet_count: number } } }
    return { id: j.data.id, name: j.data.name, handle: `@${j.data.username}`, avatar: j.data.profile_image_url, followers: j.data.public_metrics?.followers_count, posts: j.data.public_metrics?.tweet_count, url: `https://x.com/${j.data.username}` }
  },
  async posts(c, f) {
    const me = (await xGet(c, f, 'https://api.x.com/2/users/me')) as { data: { id: string; username: string } }
    const j = (await xGet(c, f, `https://api.x.com/2/users/${me.data.id}/tweets?${qs({ max_results: 20, 'tweet.fields': 'created_at,public_metrics' })}`)) as { data?: { id: string; text: string; created_at: string; public_metrics?: { like_count: number; reply_count: number; retweet_count: number; impression_count?: number } }[] }
    return (j.data ?? []).map((t) => ({ id: t.id, text: t.text, at: t.created_at, url: `https://x.com/${me.data.username}/status/${t.id}`, likes: t.public_metrics?.like_count, comments: t.public_metrics?.reply_count, shares: t.public_metrics?.retweet_count, views: t.public_metrics?.impression_count }))
  },
  async reply(c, f, commentId, text) {
    await xSend(c, f, text, commentId)
  },
  async publish(c, f, d) {
    const j = await xSend(c, f, d.link ? `${d.text} ${d.link}` : d.text)
    return { id: j.data.id, url: `https://x.com/i/web/status/${j.data.id}` }
  },
}

/* ---------- TikTok ---------- */

const TT = 'https://open.tiktokapis.com/v2'
const tiktok: Network = {
  id: 'tiktok',
  name: 'TikTok',
  can: { read: true, comments: false, reply: false, publish: true, note: 'Profile and videos. Publishing goes to your TikTok inbox to finish in the app; direct posting needs TikTok’s review.' },
  async profile(c, f) {
    const j = (await f(`${TT}/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count,profile_deep_link`, { headers: bearer(c) })) as { data: { user: { open_id: string; display_name: string; avatar_url?: string; follower_count?: number; video_count?: number; profile_deep_link?: string } } }
    const u = j.data.user
    return { id: u.open_id, name: u.display_name, avatar: u.avatar_url, followers: u.follower_count, posts: u.video_count, url: u.profile_deep_link }
  },
  async posts(c, f) {
    const j = (await f(`${TT}/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count`, { method: 'POST', headers: { ...bearer(c), 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: 20 }) })) as { data: { videos?: { id: string; title?: string; video_description?: string; create_time: number; cover_image_url?: string; share_url?: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] } }
    return (j.data.videos ?? []).map((v) => ({ id: v.id, text: v.title || v.video_description || '', at: new Date(v.create_time * 1000).toISOString(), url: v.share_url, media: v.cover_image_url, views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count }))
  },
  async publish(c, f, d) {
    if (!d.mediaUrl || d.mediaKind !== 'video') throw new Error('TikTok needs a video: add its public link.')
    const j = (await f(`${TT}/post/publish/inbox/video/init/`, { method: 'POST', headers: { ...bearer(c), 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ source_info: { source: 'PULL_FROM_URL', video_url: d.mediaUrl } }) })) as { data: { publish_id: string } }
    return { id: j.data.publish_id }
  },
}

export const NETWORKS: Record<NetworkId, Network> = { instagram, facebook, threads, youtube, linkedin, x, tiktok, bluesky, mastodon }
export const ORDER: NetworkId[] = ['instagram', 'facebook', 'threads', 'youtube', 'linkedin', 'x', 'tiktok', 'bluesky', 'mastodon']

/** How each network signs in. Meta and Threads: paste a token from their developer tools (their logins require https callbacks). */
export const OAUTH: Partial<Record<NetworkId, OAuthSpec>> = {
  youtube: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'], extra: { access_type: 'offline', prompt: 'consent' }, clientAuth: 'body' },
  x: { authorize: 'https://x.com/i/oauth2/authorize', token: 'https://api.x.com/2/oauth2/token', scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'], clientAuth: 'basic' },
  linkedin: { authorize: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken', scopes: ['openid', 'profile', 'w_member_social'], clientAuth: 'body' },
  tiktok: { authorize: 'https://www.tiktok.com/v2/auth/authorize/', token: 'https://open.tiktokapis.com/v2/oauth/token/', scopes: ['user.info.basic', 'user.info.stats', 'video.list', 'video.upload'], clientAuth: 'body', clientIdParam: 'client_key', scopeSep: ',' },
}

/** The console pages to create the app and the credential, opened in the app's setup window. */
export const SETUP: Record<NetworkId, { label: string; url: string }[]> = {
  bluesky: [{ label: 'In Bluesky, Settings, Privacy and security, App passwords: add one for SuperTokenMan', url: 'https://bsky.app/settings/app-passwords' }],
  mastodon: [{ label: 'On your server, Preferences, Development, New application: scopes read and write, then copy "Your access token"', url: 'https://mastodon.social/settings/applications' }],
  instagram: [
    { label: 'Create a Meta app (type: Business)', url: 'https://developers.facebook.com/apps/creation/' },
    { label: 'Your Instagram must be Business or Creator and linked to a Facebook Page', url: 'https://www.facebook.com/business/help/898752960195806' },
    { label: 'In Graph API Explorer, pick your app, add instagram_basic, instagram_content_publish, instagram_manage_comments, pages_show_list, pages_read_engagement, business_management, then Generate Access Token', url: 'https://developers.facebook.com/tools/explorer/' },
  ],
  facebook: [
    { label: 'Create a Meta app (type: Business)', url: 'https://developers.facebook.com/apps/creation/' },
    { label: 'In Graph API Explorer, add pages_show_list, pages_read_engagement, pages_manage_posts, pages_read_user_content, pages_manage_engagement, then Generate Access Token', url: 'https://developers.facebook.com/tools/explorer/' },
  ],
  threads: [
    { label: 'Create a Meta app with the Threads use case', url: 'https://developers.facebook.com/apps/creation/' },
    { label: 'Add yourself as a Threads tester, accept the invite in Threads settings, then use the User Token Generator', url: 'https://developers.facebook.com/docs/threads/get-started' },
  ],
  youtube: [
    { label: 'Enable the YouTube Data API v3 in your Google Cloud project', url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' },
    { label: 'Create an OAuth client of type Desktop app', url: 'https://console.cloud.google.com/auth/clients/create' },
  ],
  linkedin: [
    { label: 'Create a LinkedIn app (needs a Company Page you admin, any page works)', url: 'https://www.linkedin.com/developers/apps/new' },
    { label: `Products: add "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn". Auth: add the redirect URL shown below`, url: 'https://www.linkedin.com/developers/apps' },
  ],
  x: [
    { label: 'Open the X developer portal (Free tier is enough to post)', url: 'https://developer.x.com/en/portal/dashboard' },
    { label: 'In your app: User authentication settings, OAuth 2.0, type Web App, Read and write, add the redirect URL shown below', url: 'https://developer.x.com/en/portal/projects-and-apps' },
  ],
  tiktok: [
    { label: 'Create a TikTok app and add Login Kit and Content Posting API', url: 'https://developers.tiktok.com/apps/' },
    { label: 'Add the redirect URL shown below; sandbox works for your own account', url: 'https://developers.tiktok.com/doc/login-kit-desktop' },
  ],
}

/** Meta tokens from the Graph API Explorer: find the Page and its Instagram account, and the Page's own token. */
export async function metaIds(f: Fetcher, userToken: string): Promise<{ page?: string; pageToken?: string; igUser?: string; pageName?: string }> {
  const j = (await f(`${GRAPH}/me/accounts?${qs({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: userToken })}`)) as { data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[] }
  const p = j.data.find((x) => x.instagram_business_account) ?? j.data[0]
  return { page: p?.id, pageToken: p?.access_token, igUser: p?.instagram_business_account?.id, pageName: p?.name }
}

export type { Comment, Draft, Post, Profile }
