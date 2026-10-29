import { describe, expect, it } from 'vitest'
import { bskyRecord, bskyWebUrl, count, cut, graphemes, httpsBase, linkFacets, mastoStatus, xLength, xTweet } from './social'

describe('counting', () => {
  it('counts graphemes on Bluesky', () => {
    expect(graphemes('👍🏽é')).toBe(2)
    expect(count('bluesky', '👨‍👩‍👧'.repeat(300))).toBe(300)
  })
  it('counts a link as 23 on X and Mastodon', () => {
    const t = `${'a'.repeat(256)} https://example.com/${'x'.repeat(200)}`
    expect(count('x', t)).toBe(280)
    expect(count('mastodon', t)).toBe(280)
    expect(count('linkedin', t)).toBe(t.length)
  })
  it('weighs X text as twitter-text does: CJK and emoji count 2', () => {
    expect(xLength('a'.repeat(280))).toBe(280)
    expect(xLength('漢'.repeat(140))).toBe(280)
    expect(xLength('こんにちは')).toBe(10)
    expect(xLength('한국')).toBe(4)
    expect(xLength('😀')).toBe(2)
    expect(xLength('👨‍👩‍👧')).toBe(2)
    expect(xLength('👍🏽')).toBe(2)
    expect(xLength('🇧🇷')).toBe(2)
    expect(xLength('Ωé')).toBe(2)
    expect(xLength('é')).toBe(1)
    expect(xLength('漢 https://example.com/very/long/path')).toBe(2 + 1 + 23)
  })
  it('cuts between graphemes at the limit', () => {
    expect(cut('x', 'abcdef', 3)).toBe('abc')
    expect(cut('x', 'ab漢c', 3)).toBe('ab')
  })
})

describe('Bluesky facets', () => {
  it('gives link positions in UTF-8 bytes', () => {
    const text = 'olá ✨ https://example.com/a.'
    const f = linkFacets(text)
    expect(f).toHaveLength(1)
    expect(new TextDecoder().decode(new TextEncoder().encode(text).slice(f[0].index.byteStart, f[0].index.byteEnd))).toBe('https://example.com/a')
    expect(f[0].index.byteStart).toBe(9)
    expect(linkFacets('olá https://a.io/x.')[0].index).toEqual({ byteStart: 5, byteEnd: 19 })
  })
})

describe('requests', () => {
  it('Bluesky post and reply', () => {
    const r = bskyRecord('pds.example', 'J', 'did:plc:x', 'see https://a.io', '2026-01-01T00:00:00.000Z')
    expect(r.url).toBe('https://pds.example/xrpc/com.atproto.repo.createRecord')
    expect(r.headers.Authorization).toBe('Bearer J')
    expect(JSON.parse(r.body!)).toMatchObject({ repo: 'did:plc:x', collection: 'app.bsky.feed.post', record: { text: 'see https://a.io', facets: [{}] } })
    const ref = { uri: 'at://r/app.bsky.feed.post/1', cid: 'c' }
    expect(JSON.parse(bskyRecord('https://bsky.social', 'J', 'd', 'hi', 'now', { root: ref, parent: ref }).body!).record.reply).toEqual({ root: ref, parent: ref })
    expect(bskyWebUrl('@me.bsky.social', 'at://did:plc:x/app.bsky.feed.post/3abc')).toBe('https://bsky.app/profile/me.bsky.social/post/3abc')
  })
  it('Mastodon status and reply', () => {
    const r = mastoStatus('mastodon.social/', 't', 'hi', 'k1')
    expect(r).toMatchObject({ method: 'POST', url: 'https://mastodon.social/api/v1/statuses', body: '{"status":"hi"}' })
    expect(r.headers['Idempotency-Key']).toBe('k1')
    expect(JSON.parse(mastoStatus('https://m.s', 't', 'hi', 'k', { inReplyTo: '9', visibility: 'unlisted' }).body!)).toEqual({ status: 'hi', in_reply_to_id: '9', visibility: 'unlisted' })
    expect(() => httpsBase('http://x.y')).toThrow(/https/)
    expect(() => httpsBase('https://x.y/path')).toThrow(/no path/)
  })
  it('X post and reply', () => {
    expect(xTweet('hi', 'OAuth a')).toMatchObject({ url: 'https://api.x.com/2/tweets', body: '{"text":"hi"}', headers: { Authorization: 'OAuth a' } })
    expect(JSON.parse(xTweet('hi', 'A', '9').body!)).toEqual({ text: 'hi', reply: { in_reply_to_tweet_id: '9' } })
  })
})
