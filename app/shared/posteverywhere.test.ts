import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { bskyPost, bskySession, bskyUrl, cut, devtoPost, discordPost, discordUrl, graphemes, linkedinEscape, linkedinPost, linkFacets, mastoPost, oauth1, preview, telegramPost, telegramUrl, xPost } from './posteverywhere'

const hmac = (k: string, d: string) => createHmac('sha1', k).update(d).digest('base64')

describe('limits and preview', () => {
  it('counts graphemes on Bluesky', () => {
    expect(graphemes('👍🏽é')).toBe(2)
    expect(preview('bluesky', '👨‍👩‍👧'.repeat(300)).ok).toBe(true)
    expect(preview('bluesky', 'a'.repeat(301)).problem).toMatch(/1 over the 300 limit/)
  })
  it('counts a link as 23 on X and Mastodon', () => {
    const t = `${'a'.repeat(256)} https://example.com/${'x'.repeat(200)}`
    expect(preview('x', t).count).toBe(280)
    expect(preview('x', t).ok).toBe(true)
    expect(preview('linkedin', t).count).toBe(t.length)
  })
  it('flags what does not fit and where it would stop', () => {
    expect(preview('discord', 'b'.repeat(2001)).ok).toBe(false)
    expect(cut('x', 'abcdef', 3)).toBe('abc')
    expect(preview('devto', 'body').problem).toBe('DEV needs a title.')
    expect(preview('telegram', '   ').problem).toBe('Nothing to post.')
  })
})

describe('Bluesky', () => {
  it('builds the session and the record with byte-offset link facets', () => {
    expect(bskySession({ handle: '@me.bsky.social', password: 'p' })).toMatchObject({ url: 'https://bsky.social/xrpc/com.atproto.server.createSession', body: '{"identifier":"me.bsky.social","password":"p"}' })
    const text = 'olá ✨ https://example.com/a.'
    const f = linkFacets(text)
    expect(f).toHaveLength(1)
    expect(new TextDecoder().decode(new TextEncoder().encode(text).slice(f[0].index.byteStart, f[0].index.byteEnd))).toBe('https://example.com/a')
    expect(f[0].index.byteStart).toBe(9)
    const r = bskyPost({ pds: 'https://pds.example' }, { accessJwt: 'J', did: 'did:plc:x' }, text, '2026-01-01T00:00:00.000Z')
    expect(r.url).toBe('https://pds.example/xrpc/com.atproto.repo.createRecord')
    expect(r.headers.Authorization).toBe('Bearer J')
    expect(JSON.parse(r.body!)).toMatchObject({ repo: 'did:plc:x', collection: 'app.bsky.feed.post', record: { $type: 'app.bsky.feed.post', text, facets: f } })
    expect(bskyUrl('me.bsky.social', 'at://did:plc:x/app.bsky.feed.post/3abc')).toBe('https://bsky.app/profile/me.bsky.social/post/3abc')
  })
})

describe('request builders', () => {
  it('Mastodon', () => {
    const r = mastoPost({ instance: 'https://mastodon.social/', token: 't' }, 'hi', 'k1')
    expect(r).toMatchObject({ method: 'POST', url: 'https://mastodon.social/api/v1/statuses', body: '{"status":"hi"}' })
    expect(r.headers['Idempotency-Key']).toBe('k1')
    expect(() => mastoPost({ instance: 'http://x.y', token: 't' }, 'hi', 'k')).toThrow(/https/)
  })
  it('LinkedIn', () => {
    const r = linkedinPost({ token: 't' }, 'abc', 'see (this) #tag')
    expect(r.headers['LinkedIn-Version']).toMatch(/^\d{6}$/)
    expect(JSON.parse(r.body!)).toMatchObject({ author: 'urn:li:person:abc', commentary: 'see \\(this\\) \\#tag', lifecycleState: 'PUBLISHED' })
    expect(linkedinEscape('a_b')).toBe('a\\_b')
  })
  it('Telegram, Discord, DEV', () => {
    expect(telegramPost({ bot: '123:AB-c', chat: '@news' }, 'hi').url).toBe('https://api.telegram.org/bot123:AB-c/sendMessage')
    expect(telegramUrl('@news', 5)).toBe('https://t.me/news/5')
    expect(telegramUrl('-100123', 5)).toBeNull()
    expect(discordPost({ webhook: 'https://discord.com/api/webhooks/1/ab' }, 'hi')).toMatchObject({ url: 'https://discord.com/api/webhooks/1/ab?wait=true' })
    expect(() => discordPost({ webhook: 'https://evil.example/api/webhooks/1/ab' }, 'hi')).toThrow()
    expect(discordUrl({ id: '3', channel_id: '2', guild_id: '1' })).toBe('https://discord.com/channels/1/2/3')
    const d = devtoPost({ apiKey: 'k' }, ' T ', 'body')
    expect(d.headers['api-key']).toBe('k')
    expect(JSON.parse(d.body!)).toEqual({ article: { title: 'T', body_markdown: 'body', published: true } })
  })
  it('refuses a missing credential', () => {
    expect(() => xPost({ apiKey: 'a' }, 'hi', 'n', '1', hmac)).toThrow(/missing/)
  })
})

describe('OAuth 1.0a', () => {
  it('matches the signing example in the X docs', () => {
    const h = oauth1({
      method: 'POST', url: 'https://api.twitter.com/1.1/statuses/update.json',
      params: { include_entities: 'true', status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
      consumerKey: 'xvz1evFS4wEEPTGEFPHBog', consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
      nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: '1318622958', hmacSha1: hmac,
    })
    expect(h).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"')
    expect(h.startsWith('OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"')).toBe(true)
  })
  it('signs the v2 post without the JSON body', () => {
    const r = xPost({ apiKey: 'a', apiSecret: 'b', token: 'c', tokenSecret: 'd' }, 'hi', 'n', '1', hmac)
    expect(r.url).toBe('https://api.x.com/2/tweets')
    expect(r.headers.Authorization).toMatch(/^OAuth .*oauth_signature="/)
    expect(r.body).toBe('{"text":"hi"}')
  })
})
