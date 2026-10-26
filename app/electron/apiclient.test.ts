import { describe, expect, it } from 'vitest'
import { fill, mask, sendRequest } from './apiclient'

const vault = { get: (n: string) => ({ API_KEY: 'sk-secret-123456' })[n], all: () => [{ value: 'sk-secret-123456' }] }

describe('api client', () => {
  it('fills placeholders from the vault and reports missing ones', () => {
    const used = new Set<string>()
    const missing = new Set<string>()
    expect(fill('Bearer {{ API_KEY }} {{NOPE}}', vault.get, used, missing)).toBe('Bearer sk-secret-123456 {{NOPE}}')
    expect([...used]).toEqual(['API_KEY'])
    expect([...missing]).toEqual(['NOPE'])
  })
  it('masks vault values that come back', () => {
    expect(mask('token: sk-secret-123456!', ['sk-secret-123456', 'abc'])).toBe('token: ••••••!')
  })
  it('sends with the secret and masks the echo', async () => {
    let seen: RequestInit | undefined
    const fake = (async (_u: string, init: RequestInit) => {
      seen = init
      return new Response(JSON.stringify({ echo: (init.headers as Record<string, string>).Authorization }), { status: 200, headers: { 'x-key': 'sk-secret-123456' } })
    }) as unknown as typeof fetch
    const r = await sendRequest({ id: '1', name: 'x', method: 'post', url: 'https://api.test/v1', headers: [{ key: 'Authorization', value: 'Bearer {{API_KEY}}', on: true }], body: '{"a":1}' }, vault, fake)
    expect((seen!.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret-123456')
    expect((seen!.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(r.status).toBe(200)
    expect(r.body).toBe('{"echo":"Bearer ••••••"}')
    expect(r.headers.find(([k]) => k === 'x-key')![1]).toBe('••••••')
    expect(r.used).toEqual(['API_KEY'])
  })
  it('stops before sending when a secret is missing', async () => {
    const r = await sendRequest({ id: '1', name: 'x', method: 'GET', url: 'https://api.test/{{GONE}}', headers: [], body: '' }, vault, (() => { throw new Error('sent') }) as never)
    expect(r.error).toMatch(/GONE/)
  })
})
