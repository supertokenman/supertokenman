// Team channel store: pure append, cap and prune logic. The jsonl file I/O lives in electron.

export type PostKind = 'handoff' | 'question' | 'review' | 'result' | 'note'

export type Post = {
  id: string
  team: string
  from: string // panel id or 'you'
  kind: PostKind
  text: string
  mentions: string[]
  at: number
  depth: number
  pinned?: boolean
  replyTo?: string
}

export type Caps = { maxPosts: number; maxBytes: number }

export const CHANNEL_CAPS: Caps = { maxPosts: 2000, maxBytes: 2 * 1024 * 1024 }
export const MAX_BODY = 8000
export const MAX_PINS = 20

const enc = new TextEncoder()

// Size of one post as a jsonl line (JSON plus newline), in UTF-8 bytes.
export function postBytes(p: Post): number {
  return enc.encode(JSON.stringify(p) + '\n').length
}

// Append a post, truncating its body to MAX_BODY. Ignores a duplicate id.
// Pins are not set here; the caller passes pinned posts through unchanged.
export function append(posts: Post[], post: Post, caps: Caps = CHANNEL_CAPS): Post[] {
  if (posts.some(p => p.id === post.id)) return posts
  const text = post.text.length > MAX_BODY ? post.text.slice(0, MAX_BODY) : post.text
  const next = [...posts, { ...post, text, pinned: post.pinned ? true : undefined }]
  return prune(next, caps)
}

// Pin or unpin a post. Refuses a new pin once MAX_PINS are held.
export function setPinned(posts: Post[], id: string, pinned: boolean): Post[] {
  const target = posts.find(p => p.id === id)
  if (!target) return posts
  if (pinned && !target.pinned && posts.filter(p => p.pinned).length >= MAX_PINS) return posts
  return posts.map(p => (p.id === id ? { ...p, pinned: pinned || undefined } : p))
}

// Drop the oldest non-pinned posts until both count and bytes are within caps.
// Pinned posts are never dropped, so a cap can stay exceeded if pins alone fill it.
// Order of the surviving posts is kept.
export function prune(posts: Post[], caps: Caps = CHANNEL_CAPS): Post[] {
  let count = posts.length
  let bytes = posts.reduce((n, p) => n + postBytes(p), 0)
  if (count <= caps.maxPosts && bytes <= caps.maxBytes) return posts
  const drop = new Set<number>()
  // Oldest first by position (posts are kept in append order).
  for (let i = 0; i < posts.length && (count > caps.maxPosts || bytes > caps.maxBytes); i++) {
    if (posts[i].pinned) continue
    drop.add(i)
    count--
    bytes -= postBytes(posts[i])
  }
  return posts.filter((_, i) => !drop.has(i))
}

// Count posts newer than lastSeen that were not written by this panel.
export function unread(posts: Post[], panel: string, lastSeen: number): number {
  let n = 0
  for (const p of posts) if (p.at > lastSeen && p.from !== panel) n++
  return n
}
