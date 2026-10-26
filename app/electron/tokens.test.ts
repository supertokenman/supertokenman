import { describe, expect, it } from 'vitest'
import { countTokens, estimateTokens } from './tokens'

describe('tokens', () => {
  it('estimates prose near 4 bytes a token and code denser', () => {
    const prose = 'The quick brown fox jumps over the lazy dog and keeps running far away. '.repeat(20)
    const code = 'const x = { a: [1, 2, 3], b: "x" }; if (a) { f(b); }\n'.repeat(20)
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(prose)).toBeGreaterThan(prose.length / 4.2)
    expect(estimateTokens(prose)).toBeLessThan(prose.length / 3.6)
    expect(estimateTokens(code) / code.length).toBeGreaterThan(estimateTokens(prose) / prose.length)
  })
  it('asks the count_tokens endpoint when a key is there, and says the count is exact', async () => {
    const calls: { url: string; headers: Record<string, string>; body: { model: string } }[] = []
    const f = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
      return { ok: true, json: async () => ({ input_tokens: 107 }) }
    }) as unknown as typeof fetch
    expect(await countTokens('hello', { apiKey: 'sk-ant-x', model: 'claude-opus-5-5', fetch: f })).toEqual({ tokens: 100, exact: true })
    expect(calls[0]).toMatchObject({ url: 'https://api.anthropic.com/v1/messages/count_tokens', headers: { 'x-api-key': 'sk-ant-x' }, body: { model: 'claude-opus-5-5' } })
  })
  it('falls back to the estimate without a key or when the endpoint fails', async () => {
    const failing = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await countTokens('hello world', {})).toEqual({ tokens: estimateTokens('hello world'), exact: false })
    expect((await countTokens('hello world', { apiKey: 'k', fetch: failing })).exact).toBe(false)
  })
})
