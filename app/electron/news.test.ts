import { describe, expect, it } from 'vitest'
import * as N from './news'

const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Dev &amp; Co</title>
<item><title><![CDATA[Bun 2 is out]]></title><link>https://ex.dev/bun</link><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Faster &amp;amp; smaller&lt;/p&gt;</description><media:content url="https://ex.dev/b.png"/></item>
<item><title>Older</title><link>https://ex.dev/old</link><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Simon</title><entry><title>LLM notes</title><link rel="alternate" href="https://simon.dev/a"/><updated>2026-10-21T08:00:00Z</updated><summary type="html">Notes on &lt;b&gt;models&lt;/b&gt;</summary></entry></feed>`
const res = (body: string, ok = true, url = '') => async () => ({ ok, status: ok ? 200 : 500, text: async () => body, url })

describe('news', () => {
  it('parses RSS with CDATA, entities and media', () => {
    const f = N.parseFeed(rss, 'https://ex.dev/feed')
    expect(f.title).toBe('Dev & Co')
    expect(f.items[0]).toMatchObject({ title: 'Bun 2 is out', link: 'https://ex.dev/bun', summary: 'Faster & smaller', image: 'https://ex.dev/b.png' })
    expect(f.items[1]!.title).toBe('Older')
  })
  it('parses Atom', () => {
    const f = N.parseFeed(atom, 'https://simon.dev/atom')
    expect(f.items[0]).toMatchObject({ title: 'LLM notes', link: 'https://simon.dev/a', summary: 'Notes on models' })
  })
  it('finds a feed from a site page', async () => {
    const pages: Record<string, string> = {
      'https://ex.dev': '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>',
      'https://ex.dev/feed.xml': rss,
    }
    const g = async (u: string) => ({ ok: !!pages[u], status: pages[u] ? 200 : 404, text: async () => pages[u] ?? '', url: u })
    expect(await N.discover('ex.dev', g)).toEqual({ url: 'https://ex.dev/feed.xml', title: 'Dev & Co' })
  })
  it('keeps going when one feed fails', async () => {
    const g = async (u: string) => (u.includes('bad') ? { ok: false, status: 503, text: async () => '', url: u } : res(rss)())
    const r = await N.fetchAll([{ url: 'https://ex.dev/feed', title: 'Ex' }, { url: 'https://bad.dev/feed', title: 'Bad' }], g)
    expect(r.items).toHaveLength(2)
    expect(r.errors).toEqual([{ feed: 'Bad', error: 'answered 503' }])
  })
  it('interleaves sources so a busy one does not bury the rest', () => {
    const mk = (source: string, h: number) => ({ id: `${source}${h}`, feed: '', source, title: '', link: '', summary: '', date: new Date(Date.UTC(2026, 9, 1, h)).toISOString() })
    const out = N.interleave([mk('DEV', 10), mk('DEV', 9), mk('DEV', 8), mk('HN', 5), mk('HN', 4)])
    expect(out.map((i) => i.id)).toEqual(['DEV10', 'HN5', 'DEV9', 'HN4', 'DEV8'])
  })
  it('extracts the readable text of an article', () => {
    const r = N.extract('<html><head><meta property="og:title" content="Big news"></head><body><nav><p>menu menu menu menu menu menu menu menu menu</p></nav><article><h2>Why</h2><p>This is the first real paragraph of the article, long enough.</p><p>ok</p><script>x()</script></article></body></html>')
    expect(r.title).toBe('Big news')
    expect(r.paragraphs).toEqual(['## Why', 'This is the first real paragraph of the article, long enough.'])
  })
  it.runIf(process.env.STM_NET)('reads the default feeds for real', async () => {
    const r = await N.fetchAll(N.SUGGESTED_FEEDS)
    expect(r.items.length).toBeGreaterThan(20)
    expect(r.items.every((i) => i.link.startsWith('http'))).toBe(true)
  }, 40_000)
})
