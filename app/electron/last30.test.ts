import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { briefMarkdown, normUrl, parseGithub, parseHn, parseQuery, parseReddit, parseYoutube, rank, redditWindow, type BriefItem } from '../shared/last30'
import { gather, lastDays } from './last30'

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'last30', n), 'utf8')) as unknown
const NOW = Date.parse('2026-10-27T12:00:00Z')

describe('last 30 days: parsers', () => {
  it('reads Reddit listings, skipping adult posts', () => {
    const r = parseReddit(fx('reddit.json'))
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ source: 'reddit', url: 'https://www.reddit.com/r/javascript/comments/a1/bun_2_is_out/', engagement: 1110, where: 'r/javascript', author: 'dev1' })
  })
  it('joins YouTube search and statistics, videos only', () => {
    const y = parseYoutube(fx('yt-search.json'), fx('yt-videos.json'))
    expect(y).toEqual([expect.objectContaining({ url: 'https://www.youtube.com/watch?v=abc123', title: 'Bun 2 in 100 seconds & more', engagement: 120000 + 10 * 5300, author: 'Fireship' })])
  })
  it('reads Hacker News and GitHub', () => {
    expect(parseHn(fx('hn.json'))[0]).toMatchObject({ url: 'https://news.ycombinator.com/item?id=41', engagement: 1200 })
    expect(parseGithub(fx('github.json'))[0]).toMatchObject({ engagement: 1500, author: 'oven-sh' })
    expect(parseReddit({})).toEqual([])
    expect(parseYoutube(null, null)).toEqual([])
  })
})

describe('last 30 days: ranking', () => {
  const item = (p: Partial<BriefItem>): BriefItem => ({ source: 'hn', url: 'https://a.com/x', title: 't', date: '2026-10-20T00:00:00Z', engagement: 1, measure: '', ...p })
  it('keeps the window, drops undated posts', () => {
    const r = rank([item({ url: 'https://a.com/1' }), item({ url: 'https://a.com/2', date: '2026-08-01T00:00:00Z' }), item({ url: 'https://a.com/3', date: '' })], 30, NOW)
    expect(r.map((i) => i.url)).toEqual(['https://a.com/1'])
    expect(rank([item({ date: '2026-10-25T00:00:00Z' })], 1, NOW)).toEqual([])
  })
  it('dedupes by address and keeps the more engaged copy', () => {
    const r = rank([item({ url: 'https://www.bun.sh/blog/?utm_source=x', engagement: 3 }), item({ url: 'https://bun.sh/blog#top', engagement: 9, source: 'reddit' })], 30, NOW)
    expect(r).toHaveLength(1)
    expect(r[0]!.engagement).toBe(9)
    expect(normUrl('https://www.youtube.com/watch?v=abc&si=x')).toBe('youtube.com/watch?v=abc')
  })
  it('ranks by share of each source top, then raw engagement', () => {
    const r = rank([item({ url: 'https://y.com/1', source: 'youtube', engagement: 100000 }), item({ url: 'https://y.com/2', source: 'youtube', engagement: 1000 }), item({ url: 'https://h.com/1', source: 'hn', engagement: 500 })], 30, NOW)
    expect(r.map((i) => i.url)).toEqual(['https://y.com/1', 'https://h.com/1', 'https://y.com/2'])
  })
  it('reads handles and topics, and windows for Reddit', () => {
    expect(parseQuery('@simonw')).toEqual({ kind: 'person', handle: 'simonw' })
    expect(parseQuery('u/spez')).toEqual({ kind: 'person', handle: 'spez' })
    expect(parseQuery('bun 2')).toEqual({ kind: 'topic', text: 'bun 2' })
    expect(parseQuery('a')).toBeNull()
    expect([redditWindow(1), redditWindow(7), redditWindow(30), redditWindow(90)]).toEqual(['day', 'week', 'month', 'year'])
  })
})

describe('last 30 days: gathering', () => {
  const routes = (calls: string[]): typeof fetch =>
    (async (u: string | URL) => {
      const url = String(u)
      calls.push(url)
      const body = url.includes('access_token') ? { access_token: 'T' } : url.includes('oauth.reddit') ? fx('reddit.json') : url.includes('/videos') ? fx('yt-videos.json') : url.includes('youtube') ? fx('yt-search.json') : url.includes('algolia') ? fx('hn.json') : fx('github.json')
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
  it('skips Reddit and YouTube without credentials, and fetches nothing for them', async () => {
    const calls: string[] = []
    const g = await gather({ kind: 'topic', text: 'bun' }, 30, ['reddit', 'youtube', 'hn', 'github'], { fetch: routes(calls), creds: {}, ask: async () => '', allow: () => null, now: NOW })
    expect(g.states.find((s) => s.source === 'reddit')).toMatchObject({ skipped: 'Connect Reddit' })
    expect(calls.some((c) => /reddit|youtube|googleapis/.test(c))).toBe(false)
    expect(g.items.map((i) => i.source)).toEqual(expect.arrayContaining(['hn', 'github']))
  })
  it('writes a brief from all four, newest window only, behind the brake', async () => {
    const calls: string[] = []
    let asked = ''
    const d = { fetch: routes(calls), creds: { redditId: 'id', redditSecret: 's', youtubeKey: 'k' }, ask: async (p: string) => ((asked = p), '- Bun 2 shipped [1]'), allow: () => null, now: NOW }
    const r = await lastDays({ query: { kind: 'topic', text: 'bun 2' }, days: 30, sources: ['reddit', 'youtube', 'hn', 'github'] }, d)
    expect('brief' in r && r.brief).toBe('- Bun 2 shipped [1]')
    expect(r.items.some((i) => i.title === 'Old thread')).toBe(false)
    expect(calls.some((c) => c.includes('oauth.reddit.com/search') && c.includes('t=month'))).toBe(true)
    expect(asked).toContain('last 30 days')
    expect(briefMarkdown('bun 2', 30, '- x [1]', r.items)).toMatch(/## Links\n1\. \[/)
    const stopped = await lastDays({ query: { kind: 'topic', text: 'bun 2' }, days: 30, sources: ['hn'] }, { ...d, allow: () => 'Over the limit' })
    expect(stopped).toMatchObject({ stopped: 'Over the limit' })
    expect(await lastDays({ query: { kind: 'topic', text: 'dossier on my landlord' }, days: 30, sources: ['hn'] }, d)).toMatchObject({ stopped: expect.stringMatching(/people/) })
  })
})
