import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crawl, extract, readPage, saveWebConfig, search, setWebDir, setWebStore, webConfig, type Page } from './reader'

const SITE: Record<string, Page> = {
  'http://a.test/': { url: 'http://a.test/', title: 'Home', markdown: 'Acme takes Pix.', links: [{ href: '/cards' , text: 'Cards' }, { href: '/payouts', text: 'Payouts' }, { href: '/fees', text: 'Fees' }] },
  'http://a.test/fees': { url: 'http://a.test/fees', title: 'Fees', markdown: 'Pix fee 0.99%. Card fee 1.99%.', links: [] },
  'http://a.test/payouts': { url: 'http://a.test/payouts', title: 'Payouts', markdown: 'Payouts next day. Pix payouts instant.', links: [{ href: '/fees', text: 'Fees' }] },
  'http://a.test/cards': { url: 'http://a.test/cards', title: 'Cards', markdown: 'Visa.', links: [] },
}
const fake = async (url: string) => SITE[url] ?? { error: 'not found' }

describe('web reader', () => {
  it('crawls toward the question and stops when it is covered', async () => {
    const c = await crawl('http://a.test/', 'pix fee and payouts', 8, fake)
    expect(c.stop).toBe('covered')
    expect(c.pages.map((p) => p.title)).toEqual(['Home', 'Payouts', 'Fees'])
    expect(c.missing).toEqual([])
  })

  it('stops at the cap and says what was not found', async () => {
    const c = await crawl('http://a.test/', 'refunds and chargebacks', 2, fake)
    expect(c.stop).toBe('max-pages')
    expect(c.pages).toHaveLength(2)
    expect(c.missing).toEqual(['refund', 'chargeback'])
    await expect(crawl('http://a.test:8http://x', 'q x y', 2, fake)).rejects.toThrow(/not a valid address/)
  })

  it('keeps schemas and runs them with no model', async () => {
    setWebStore(join(mkdtempSync(join(tmpdir(), 'wr-')), 'web.json'))
    expect(webConfig().schemas).toEqual([])
    saveWebConfig({ schemas: [{ name: 'plans', prefix: 'http://a.test/products', baseSelector: '.p', fields: [{ name: 'n', selector: '.n', type: 'text' }], learnedAt: 1, runs: 0 }] })
    const seen: unknown[] = []
    const r = await extract('http://a.test/products.html', undefined, async (_u, _m, o) => (seen.push(o?.schema), { items: [{ n: 'Pro' }] }))
    expect(r).toEqual({ schema: 'plans', items: [{ n: 'Pro' }] })
    expect(seen[0]).toMatchObject({ baseSelector: '.p' })
    expect(webConfig().schemas[0]!.runs).toBe(1)
    expect((await extract('http://b.test/', undefined, fake)).error).toMatch(/No saved schema/)
  })

  it('searches only with a SearXNG address set', async () => {
    setWebStore(join(mkdtempSync(join(tmpdir(), 'wr-')), 'web.json'))
    await expect(search('x', 3)).rejects.toThrow(/SearXNG/)
    saveWebConfig({ searchUrl: 'http://127.0.0.1:9/' })
    let asked = ''
    const hits = await search('pix fee', 1, (async (u: string) => ((asked = u), new Response(JSON.stringify({ results: [{ url: 'https://x.test/', title: 'X' }, { url: 'https://y.test/' }] })))) as typeof fetch)
    expect(asked).toBe('http://127.0.0.1:9/search?format=json&q=pix%20fee')
    expect(hits.map((h) => h.url)).toEqual(['https://x.test/'])
  })

  // the real engine against a local site: STM_WEB_LIVE=http://127.0.0.1:8903 with engines/web/.venv installed
  it.runIf(Boolean(process.env.STM_WEB_LIVE))('reads, fits, respects robots.txt and extracts for real', async () => {
    const base = process.env.STM_WEB_LIVE!
    setWebDir(join(__dirname, '..', '..', 'engines', 'web'))
    setWebStore(join(mkdtempSync(join(tmpdir(), 'wr-')), 'web.json'))
    const fit = await readPage(`${base}/docs/fees.html`, 5000, { question: 'pix fee', cache: 'bypass' })
    expect(fit.markdown).toContain('0.99%')
    expect(fit.markdown).not.toContain('Careers')
    expect((await readPage(`${base}/private/x.html`)).error).toMatch(/robots/)
    const c = await crawl(`${base}/`, 'pix fee and payouts', 6)
    expect(c.stop).toBe('covered')
    saveWebConfig({ schemas: [{ name: 'plans', prefix: `${base}/products`, baseSelector: '.prod', fields: [{ name: 'name', selector: '.name', type: 'text' }, { name: 'price', selector: '.price', type: 'text' }], learnedAt: 1, runs: 0 }] })
    expect((await extract(`${base}/products.html`)).items).toEqual([{ name: 'Starter', price: 'R$ 0' }, { name: 'Pro', price: 'R$ 49' }, { name: 'Team', price: 'R$ 199' }])
  }, 240_000)
})
