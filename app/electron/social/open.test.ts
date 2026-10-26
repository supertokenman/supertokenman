import { describe, expect, it } from 'vitest'
import { bluesky, bskyItem, bskySession, htmlText, linkFacets, mastoCred, mastoItem, splitBid } from './open'
import { problem, cleanItem } from './queue'

describe('bluesky', () => {
  it('keeps uri and cid together as the post id and refuses anything else', () => {
    const it = bskyItem({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k2', cid: 'bafyabc', author: { did: 'did:plc:abc', handle: 'ana.bsky.social', displayName: 'Ana' }, record: { text: 'oi', createdAt: '2026-10-23T10:00:00Z' }, likeCount: 2, viewer: { like: 'at://x' } })
    expect(it).toMatchObject({ id: 'at://did:plc:abc/app.bsky.feed.post/3k2|bafyabc', url: 'https://bsky.app/profile/ana.bsky.social/post/3k2', liked: true, likes: 2 })
    expect(splitBid(it.id)).toEqual({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k2', cid: 'bafyabc' })
    expect(() => splitBid('https://evil|x')).toThrow()
  })
  it('makes links clickable with UTF-8 byte offsets', () => {
    const f = linkFacets('Ação: https://supertokenman.com.br.')
    expect(f[0]?.features[0]?.uri).toBe('https://supertokenman.com.br')
    expect(f[0]?.index.byteStart).toBe(Buffer.byteLength('Ação: '))
  })
  it('signs in with an app password only', async () => {
    await expect(bskySession(async () => ({}), 'ana.bsky.social minhasenha123')).rejects.toThrow('app password')
    const c = await bskySession(async (_u, init) => (JSON.parse(String(init?.body)).identifier === 'ana.bsky.social' ? { accessJwt: 'a', refreshJwt: 'r', did: 'did:plc:abc', handle: 'ana.bsky.social' } : {}), '@ana.bsky.social abcd-efgh-ijkl-mnop')
    expect(c).toMatchObject({ accessToken: 'a', refreshToken: 'r', ids: { did: 'did:plc:abc' } })
  })
  it('replies under the thread root', async () => {
    let record: { reply?: unknown } = {}
    const f = async (url: string, init?: { body?: string }) => {
      if (url.includes('getPosts')) return { posts: [{ record: { reply: { root: { uri: 'at://root', cid: 'cidroot' } } } }] }
      record = JSON.parse(init!.body!).record
      return { uri: 'at://new', cid: 'c' }
    }
    await bluesky.reply!({ accessToken: 't', ids: { did: 'did:plc:me' } }, f as never, 'at://did:plc:x/app.bsky.feed.post/1|cidparent', 'valeu')
    expect(record.reply).toEqual({ root: { uri: 'at://root', cid: 'cidroot' }, parent: { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'cidparent' } })
  })
})

describe('mastodon', () => {
  it('reads the server and token, and turns HTML posts into text', () => {
    expect(mastoCred('https://Mastodon.Social/ tok123')).toEqual({ accessToken: 'tok123', ids: { server: 'mastodon.social' } })
    expect(() => mastoCred('tok123')).toThrow()
    expect(htmlText('<p>Oi &amp; tchau<br>linha</p><p>dois</p>')).toBe('Oi & tchau\nlinha\n\ndois')
  })
  it('shows a boost as the original post, saying who boosted it', () => {
    const it = mastoItem({ id: '2', created_at: 'x', content: '', account: { acct: 'bob', display_name: 'Bob' }, reblog: { id: '1', created_at: '2026-10-23T10:00:00Z', content: '<p>hello</p>', account: { acct: 'ana@x.social' }, favourites_count: 3 } })
    expect(it).toMatchObject({ id: '1', text: 'hello', repostedBy: 'Bob', author: { handle: '@ana@x.social' }, likes: 3 })
  })
})

describe('queue limits', () => {
  it('holds Bluesky to 300 and Mastodon to 500 characters', () => {
    const i = cleanItem({ text: 'a'.repeat(301), networks: ['bluesky', 'mastodon'] })
    expect(i.networks).toEqual(['bluesky', 'mastodon'])
    expect(problem(i, 'bluesky')).toContain('300')
    expect(problem(i, 'mastodon')).toBe('')
  })
})
