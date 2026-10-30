import { describe, it, expect } from 'vitest'
import {
  append, prune, setPinned, unread, postBytes, MAX_BODY, MAX_PINS, type Post,
} from './teamchannel.js'

const mk = (i: number, over: Partial<Post> = {}): Post => ({
  id: `p${i}`, team: 't1', from: 'you', kind: 'note', text: 'hi', mentions: [],
  at: i, depth: 0, ...over,
})

describe('append', () => {
  it('appends in order and ignores a duplicate id', () => {
    let posts: Post[] = []
    posts = append(posts, mk(1), { maxPosts: 10, maxBytes: 1e9 })
    posts = append(posts, mk(2), { maxPosts: 10, maxBytes: 1e9 })
    posts = append(posts, mk(2), { maxPosts: 10, maxBytes: 1e9 })
    expect(posts.map(p => p.id)).toEqual(['p1', 'p2'])
  })

  it('truncates a body over MAX_BODY', () => {
    const out = append([], mk(1, { text: 'x'.repeat(MAX_BODY + 50) }))
    expect(out[0].text.length).toBe(MAX_BODY)
  })
})

describe('prune caps', () => {
  it('drops oldest posts over the count cap', () => {
    const posts = Array.from({ length: 5 }, (_, i) => mk(i + 1))
    const out = prune(posts, { maxPosts: 3, maxBytes: 1e9 })
    expect(out.map(p => p.id)).toEqual(['p3', 'p4', 'p5'])
  })

  it('drops oldest posts over the byte cap', () => {
    const posts = Array.from({ length: 4 }, (_, i) => mk(i + 1, { text: 'a'.repeat(100) }))
    const keep = postBytes(posts[2]) + postBytes(posts[3])
    const out = prune(posts, { maxPosts: 100, maxBytes: keep })
    expect(out.map(p => p.id)).toEqual(['p3', 'p4'])
  })

  it('keeps pinned posts even when they are oldest', () => {
    const posts = [mk(1, { pinned: true }), mk(2), mk(3), mk(4)]
    const out = prune(posts, { maxPosts: 2, maxBytes: 1e9 })
    expect(out.map(p => p.id)).toEqual(['p1', 'p4'])
  })

  it('returns the same array when already within caps', () => {
    const posts = [mk(1), mk(2)]
    expect(prune(posts, { maxPosts: 2, maxBytes: 1e9 })).toBe(posts)
  })

  it('stops when only pins remain over the cap', () => {
    const posts = [mk(1, { pinned: true }), mk(2, { pinned: true }), mk(3)]
    const out = prune(posts, { maxPosts: 1, maxBytes: 1e9 })
    expect(out.map(p => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('setPinned', () => {
  it('pins and unpins a post', () => {
    const posts = [mk(1)]
    const pinned = setPinned(posts, 'p1', true)
    expect(pinned[0].pinned).toBe(true)
    expect(setPinned(pinned, 'p1', false)[0].pinned).toBeUndefined()
  })

  it('refuses a pin past MAX_PINS', () => {
    let posts = Array.from({ length: MAX_PINS + 1 }, (_, i) => mk(i + 1))
    for (let i = 0; i < MAX_PINS; i++) posts = setPinned(posts, `p${i + 1}`, true)
    const after = setPinned(posts, `p${MAX_PINS + 1}`, true)
    expect(after[MAX_PINS].pinned).toBeUndefined()
  })

  it('ignores an unknown id', () => {
    const posts = [mk(1)]
    expect(setPinned(posts, 'nope', true)).toBe(posts)
  })
})

describe('unread', () => {
  it('counts newer posts from others', () => {
    const posts = [
      mk(1, { from: 'a' }),
      mk(2, { from: 'you' }),
      mk(3, { from: 'a' }),
      mk(4, { from: 'b' }),
    ]
    expect(unread(posts, 'a', 1)).toBe(2) // p2 (you) and p4 (b); p3 is own
    expect(unread(posts, 'a', 0)).toBe(2)
    expect(unread(posts, 'a', 4)).toBe(0)
  })
})
