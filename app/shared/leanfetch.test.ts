import { describe, expect, it } from 'vitest'
import { cacheFor, checkSchema, chunk, coverage, nextLinks, schemaFor, searxHits, shouldStop, terms, type Schema } from './leanfetch'

describe('lean fetch', () => {
  it('reads a question as terms and measures coverage', () => {
    expect(terms('What are the Pix fees and payouts?')).toEqual(['pix', 'fee', 'payout'])
    const c = coverage('pix fees and payout days', ['Pix fee is 0.99%. Card fee 1.99%.', 'Payouts land the next business day. Pix payouts on any day.'])
    expect(c.covered).toEqual(['pix', 'fee', 'payout', 'day'])
    expect(c.share).toBe(1)
    // named once in passing is not covered
    expect(coverage('fees and payouts', ['Read about fees and payouts in the docs.']).share).toBe(0)
    expect(coverage('fees and payouts', ['[Fees](/fees) [Payouts](/payouts) Read about fees and payouts.']).share).toBe(0)
    expect(coverage('pix refunds', ['Pix fee', 'Pix'], 1).missing).toEqual(['refund'])
  })

  it('follows same-site links that name what is missing', () => {
    const links = [
      { href: '/docs/cards.html', text: 'Cards' },
      { href: '/docs/payouts.html', text: 'Payouts' },
      { href: 'https://other.site/payouts', text: 'Payouts elsewhere' },
      { href: '/logo.png', text: 'payouts' },
      { href: '/docs/fees.html#top', text: 'Fees' },
    ]
    const seen = new Set(['http://a.test/docs/fees.html'])
    expect(nextLinks(links, 'http://a.test/', seen, ['payout'])).toEqual(['http://a.test/docs/payouts.html'])
    // nothing names a missing term: the first link still goes, so the crawl can look around
    expect(nextLinks(links, 'http://a.test/', seen, ['zzz'])).toEqual(['http://a.test/docs/cards.html'])
  })

  it('stops when covered, when two pages add nothing, or at the cap', () => {
    expect(shouldStop([0.5, 1], 2, 10)).toBe('covered')
    expect(shouldStop([0.5, 0.5, 0.5], 3, 10)).toBe('no-gain')
    expect(shouldStop([0.2, 0.5], 2, 2)).toBe('max-pages')
    expect(shouldStop([0.2, 0.4, 0.6], 3, 10)).toBeNull()
  })

  it('chunks at headings, then paragraphs, within the limit', () => {
    const text = `# A\n${'one. '.repeat(30)}\n\n# B\nshort\n\n${'two words. '.repeat(40)}`
    const parts = chunk(text, 200)
    expect(parts.every((p) => p.length <= 200)).toBe(true)
    expect(parts[0]!.startsWith('# A')).toBe(true)
    expect(parts.some((p) => p.startsWith('# B'))).toBe(true)
    expect(parts.join(' ').replace(/\s+/g, ' ').length).toBeGreaterThan(text.replace(/\s+/g, ' ').length - 20)
    expect(chunk('small', 200)).toEqual(['small'])
  })

  it('checks and matches saved schemas and cache rules', () => {
    const s: Schema = { name: 'plans', prefix: 'http://a.test/products', baseSelector: '.prod', fields: [{ name: 'name', selector: '.name', type: 'text' }], learnedAt: 0, runs: 0 }
    expect(checkSchema(s)).toBeNull()
    expect(checkSchema({ ...s, fields: [{ name: 'x', selector: 'a', type: 'attribute' }] })).toMatch(/attribute/)
    expect(checkSchema({ ...s, prefix: 'file:///etc' })).toMatch(/prefix/)
    const wide = { ...s, name: 'site', prefix: 'http://a.test/' }
    expect(schemaFor('http://a.test/products.html', [wide, s])?.name).toBe('plans')
    expect(schemaFor('http://a.test/x', [wide, s], 'plans')?.name).toBe('plans')
    expect(schemaFor('http://b.test/', [wide, s])).toBeUndefined()
    const rules = [{ prefix: 'http://a.test/', mode: 'bypass' as const }, { prefix: 'http://a.test/docs/', mode: 'read_only' as const }]
    expect(cacheFor('http://a.test/docs/x', rules)).toBe('read_only')
    expect(cacheFor('http://a.test/y', rules)).toBe('bypass')
    expect(cacheFor('http://c.test/', rules)).toBe('enabled')
  })

  it('takes search hits from SearXNG', () => {
    const j = { results: [{ url: 'https://a.test/1', title: 'One', content: 'x' }, { url: 'https://a.test/1' }, { url: 'javascript:x' }, { url: 'https://b.test/', title: 'Two' }, { url: 'https://c.test/' }] }
    expect(searxHits(j, 2).map((h) => h.url)).toEqual(['https://a.test/1', 'https://b.test/'])
    expect(searxHits(null, 3)).toEqual([])
  })
})
