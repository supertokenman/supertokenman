import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChannelStore } from './channelstore'
import type { Post } from '../shared/teamchannel'

const post = (n: number, extra: Partial<Post> = {}): Post => ({ id: `p${n}`, team: 't1', from: 'you', kind: 'note', text: `post ${n}`, mentions: [], at: n, depth: 0, ...extra })

describe('ChannelStore', () => {
  it('appends to a jsonl file and reads it back after a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chan-'))
    const a = new ChannelStore(dir)
    a.add(post(1))
    a.add(post(2))
    expect(readFileSync(join(dir, 't1.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2)
    expect(new ChannelStore(dir).posts('t1').map((p) => p.id)).toEqual(['p1', 'p2'])
  })
  it('prunes the oldest unpinned posts past the cap and keeps pins', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chan-'))
    const s = new ChannelStore(dir, { maxPosts: 3, maxBytes: 1_000_000 })
    s.add(post(1))
    s.pin('t1', 'p1', true)
    for (let i = 2; i <= 6; i++) s.add(post(i))
    expect(s.posts('t1').map((p) => p.id)).toEqual(['p1', 'p5', 'p6'])
    expect(new ChannelStore(dir, { maxPosts: 3, maxBytes: 1_000_000 }).posts('t1').map((p) => p.id)).toEqual(s.posts('t1').map((p) => p.id))
  })
  it('cuts a body to the limit and refuses a team id that is a path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'chan-'))
    const s = new ChannelStore(dir)
    expect(s.add(post(1, { text: 'x'.repeat(9000) })).text).toHaveLength(8000)
    expect(() => s.posts('../x')).toThrow()
  })
})
