import { describe, expect, it } from 'vitest'
import { blueskyLogin, credFromFields, hostOf } from './accounts'
import { devtoPost, discordPost, discordUrl, linkedinEscape, linkedinPost, preview, telegramPost, telegramUrl } from './posteverywhere'

describe('preview', () => {
  it('flags what does not fit and where it would stop', () => {
    expect(preview('bluesky', 'a'.repeat(301)).problem).toMatch(/1 over the 300 limit/)
    expect(preview('x', '漢'.repeat(141)).problem).toMatch(/2 over the 280 limit/)
    expect(preview('mastodon', 'a'.repeat(600), '', 1000).ok).toBe(true)
    expect(preview('discord', 'b'.repeat(2001)).ok).toBe(false)
    expect(preview('devto', 'body').problem).toBe('DEV needs a title.')
    expect(preview('telegram', '   ').problem).toBe('Nothing to post.')
  })
})

describe('accounts', () => {
  it('turns pasted fields into one credential per network', () => {
    expect(credFromFields('mastodon', { instance: 'https://mastodon.social/', token: ' t ', limit: '1000' })).toEqual({ accessToken: 't', ids: { server: 'mastodon.social', limit: '1000' } })
    expect(() => credFromFields('mastodon', { instance: 'http://x.y', token: 't' })).toThrow(/https/)
    expect(credFromFields('x', { consumerKey: 'a', consumerSecret: 'b', token: 'c', tokenSecret: 'd' })).toEqual({ accessToken: '', keys: { consumerKey: 'a', consumerSecret: 'b', token: 'c', tokenSecret: 'd' } })
    expect(() => credFromFields('x', { consumerKey: 'a' })).toThrow(/missing/)
    expect(credFromFields('telegram', { bot: '123:AB-c', chat: '@news' })).toEqual({ accessToken: '123:AB-c', ids: { chat: '@news' } })
    expect(() => credFromFields('telegram', { bot: 'nope', chat: '1' })).toThrow(/bot token/)
    expect(() => credFromFields('discord', { webhook: 'https://evil.example/api/webhooks/1/ab' })).toThrow()
    expect(blueskyLogin({ handle: '@me.bsky.social', password: 'abcd-efgh-ijkl-mnop' })).toEqual({ handle: 'me.bsky.social', password: 'abcd-efgh-ijkl-mnop', pds: 'https://bsky.social' })
    expect(() => blueskyLogin({ handle: 'me', password: 'hunter2' })).toThrow(/app password/)
    expect(hostOf('bluesky', { accessToken: 'j', ids: { pds: 'https://pds.example' } })).toBe('pds.example')
  })
})

describe('request builders', () => {
  it('LinkedIn', () => {
    const r = linkedinPost({ accessToken: 't' }, 'abc', 'see (this) #tag')
    expect(r.headers['LinkedIn-Version']).toMatch(/^\d{6}$/)
    expect(JSON.parse(r.body!)).toMatchObject({ author: 'urn:li:person:abc', commentary: 'see \\(this\\) \\#tag', lifecycleState: 'PUBLISHED' })
    expect(linkedinEscape('a_b')).toBe('a\\_b')
  })
  it('Telegram, Discord, DEV', () => {
    expect(telegramPost({ accessToken: '123:AB-c', ids: { chat: '@news' } }, 'hi').url).toBe('https://api.telegram.org/bot123:AB-c/sendMessage')
    expect(telegramUrl('@news', 5)).toBe('https://t.me/news/5')
    expect(telegramUrl('-100123', 5)).toBeNull()
    expect(discordPost({ accessToken: 'https://discord.com/api/webhooks/1/ab' }, 'hi')).toMatchObject({ url: 'https://discord.com/api/webhooks/1/ab?wait=true' })
    expect(discordUrl({ id: '3', channel_id: '2', guild_id: '1' })).toBe('https://discord.com/channels/1/2/3')
    const d = devtoPost({ accessToken: 'k' }, ' T ', 'body')
    expect(d.headers['api-key']).toBe('k')
    expect(JSON.parse(d.body!)).toEqual({ article: { title: 'T', body_markdown: 'body', published: true } })
  })
})
