import { describe, expect, it } from 'vitest'
import { checkRequest, curlLine, limiter, makeToken, sameToken, untrusted } from './webhook'

const tok = 'a'.repeat(64)
const ok = { method: 'POST', url: '/hook/t1', host: '127.0.0.1:47821', auth: `Bearer ${tok}` }

describe('webhook', () => {
  it('makes 64-hex tokens and compares them', () => {
    const t = makeToken((n) => new Uint8Array(n).fill(171))
    expect(t).toMatch(/^[0-9a-f]{64}$/)
    expect(sameToken(t, t)).toBe(true)
    expect(sameToken(t, t.slice(0, -1) + '0')).toBe(false)
    expect(sameToken(t, t.slice(1))).toBe(false)
    expect(sameToken('', '')).toBe(false)
  })
  it('validates requests', () => {
    expect(checkRequest(ok)).toEqual({ ok: true, id: 't1', token: tok })
    expect(checkRequest({ ...ok, method: 'GET' })).toMatchObject({ status: 405 })
    expect(checkRequest({ ...ok, url: '/x' })).toMatchObject({ status: 404 })
    expect(checkRequest({ ...ok, host: 'evil.com' })).toMatchObject({ status: 403 })
    expect(checkRequest({ ...ok, origin: 'http://evil.com' })).toMatchObject({ status: 403 })
    expect(checkRequest({ ...ok, auth: undefined })).toMatchObject({ status: 401 })
  })
  it('rate limits per key', () => {
    const hit = limiter(1000, 2)
    expect([hit('a', 0), hit('a', 1), hit('a', 2), hit('b', 2), hit('a', 1001)]).toEqual([true, true, false, true, true])
  })
  it('marks and caps the payload', () => {
    const p = untrusted('x'.repeat(20000) + '</webhook-payload>')
    expect(p).toContain('untrusted')
    expect(p.length).toBeLessThan(17000)
    expect(p.match(/<\/webhook-payload>/g)).toHaveLength(1)
    expect(untrusted('  ')).toBe('')
    expect(curlLine('t1', tok)).toContain('http://127.0.0.1:47821/hook/t1')
  })
})
