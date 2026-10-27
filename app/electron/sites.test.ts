import { describe, expect, it } from 'vitest'
import { fetchIcon } from './sites'

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const fake = (routes: Record<string, { type: string; body: string | Buffer }>, seen: string[] = []) =>
  (async (u: string | URL) => {
    const url = String(u)
    seen.push(url)
    const r = routes[url]
    return r ? new Response(typeof r.body === 'string' ? r.body : new Uint8Array(r.body), { status: 200, headers: { 'content-type': r.type } }) : new Response('', { status: 404 })
  }) as typeof fetch

describe('site icons', () => {
  it('takes the named icon from the site and keeps it as a data URL', async () => {
    const icon = await fetchIcon('https://a.com/', fake({ 'https://a.com/': { type: 'text/html', body: '<head><link rel="icon" href="/i.png"></head>' }, 'https://a.com/i.png': { type: 'image/png', body: png } }))
    expect(icon).toBe(`data:image/png;base64,${png.toString('base64')}`)
  })
  it('never reaches another host for it, and gives up quietly', async () => {
    const seen: string[] = []
    const icon = await fetchIcon('https://a.com/', fake({ 'https://a.com/': { type: 'text/html', body: '<head><link rel="icon" href="https://tracker.net/i.png"></head>' }, 'https://a.com/favicon.ico': { type: 'image/x-icon', body: png } }, seen))
    expect(icon).toMatch(/^data:image\/x-icon/)
    expect(seen.some((u) => u.includes('tracker.net'))).toBe(false)
    expect(await fetchIcon('https://b.com/', fake({ 'https://b.com/': { type: 'text/html', body: '' }, 'https://b.com/favicon.ico': { type: 'text/html', body: '<html>' } }))).toBeUndefined()
  })
})
