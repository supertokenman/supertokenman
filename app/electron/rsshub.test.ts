import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanInstance, feedKind, feedLinks, routeOf, rsshubUrl } from '../shared/rsshub'
import { discoverAll, parseFeed } from './news'

const fx = (n: string) => readFileSync(join(__dirname, '__fixtures__', 'feeds', n), 'utf8')
const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>Trending</title><item><title>x</title><link>https://a.com/x</link></item></channel></rss>'

describe('RSSHub routes', () => {
  it('reads the route forms', () => {
    expect(routeOf('/github/trending/daily')).toBe('/github/trending/daily')
    expect(routeOf('rsshub:/youtube/user/@x')).toBe('/youtube/user/@x')
    expect(routeOf('rsshub://youtube/user/@x')).toBe('/youtube/user/@x')
    expect(routeOf('https://site.com/feed')).toBeNull()
    expect(routeOf('site.com')).toBeNull()
    expect(routeOf('/a/../../etc')).toBeNull()
  })
  it('joins instance and route, and asks for an instance first', () => {
    expect(rsshubUrl('/github/trending/daily', 'https://rsshub.app')).toBe('https://rsshub.app/github/trending/daily')
    expect(rsshubUrl('rsshub:/x/y', 'http://192.168.1.5:1200/')).toBe('http://192.168.1.5:1200/x/y')
    expect(rsshubUrl('https://site.com', 'https://rsshub.app')).toBeNull()
    expect(() => rsshubUrl('/github/trending/daily', '')).toThrow(/instance/)
  })
  it('cleans the instance setting', () => {
    expect(cleanInstance('')).toBe('')
    expect(cleanInstance(' https://rsshub.app/ ')).toBe('https://rsshub.app')
    expect(() => cleanInstance('ftp://x')).toThrow()
    expect(() => cleanInstance('https://u:p@x.com')).toThrow()
    expect(() => cleanInstance('not a url')).toThrow()
  })
})

describe('feed discovery', () => {
  it('finds alternate links in the head, in order, once each', () => {
    const f = feedLinks(fx('blog.html'), 'https://ana.dev/blog/')
    expect(f).toEqual([
      { url: 'https://ana.dev/posts.rss', title: "Ana's posts", type: 'rss' },
      { url: 'https://ana.dev/atom.xml?x=1&y=2', title: '', type: 'atom' },
      { url: 'https://ana.dev/blog/feed.json', title: 'JSON', type: 'json' },
    ])
    expect(feedLinks(fx('plain.html'), 'https://x.com/')).toEqual([])
  })
  it('tells feeds apart and reads a JSON Feed', () => {
    expect(feedKind(RSS)).toBe('rss')
    expect(feedKind(fx('feed.json'))).toBe('json')
    expect(feedKind(fx('plain.html'))).toBeNull()
    expect(parseFeed(fx('feed.json'), 'https://ana.dev/feed.json').items[0]).toMatchObject({ title: 'A post', link: 'https://ana.dev/a', summary: 'Hello' })
  })
  const site = (pages: Record<string, string>, seen: string[] = []) => async (url: string) => {
    seen.push(url)
    const body = pages[url]
    return { ok: body != null, status: body != null ? 200 : 404, url, text: async () => body ?? '' }
  }
  it('offers every named feed without fetching them, or falls back to the usual paths', async () => {
    const seen: string[] = []
    const f = await discoverAll('ana.dev', '', site({ 'https://ana.dev': fx('blog.html') }, seen))
    expect(f.map((x) => x.url)).toHaveLength(3)
    expect(f[1]!.title).toBe("Ana's blog")
    expect(seen).toEqual(['https://ana.dev'])
    const g = await discoverAll('https://x.com', '', site({ 'https://x.com': fx('plain.html'), 'https://x.com/rss.xml': RSS }))
    expect(g).toEqual([{ url: 'https://x.com/rss.xml', title: 'Trending', type: 'rss' }])
    await expect(discoverAll('https://y.com', '', site({ 'https://y.com': fx('plain.html') }))).rejects.toThrow(/No feed/)
  })
  it('subscribes a route to the instance and checks it is a feed', async () => {
    const f = await discoverAll('/github/trending/daily', 'https://hub.me', site({ 'https://hub.me/github/trending/daily': RSS }))
    expect(f).toEqual([{ url: 'https://hub.me/github/trending/daily', title: 'Trending', type: 'rss' }])
    await expect(discoverAll('/nope', 'https://hub.me', site({}))).rejects.toThrow(/no such route/)
    await expect(discoverAll('/github/trending/daily', '', site({}))).rejects.toThrow(/instance/)
  })
})
