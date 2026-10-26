import { describe, expect, it } from 'vitest'
import * as B from './billing'

const now = new Date('2026-10-23T12:00:00Z')

describe('billing', () => {
  it('asks for the key it lacks instead of failing', async () => {
    const r = await B.all(() => undefined, [], async () => ({}), now)
    expect(r.map((s) => s.missing)).toEqual(['ANTHROPIC_ADMIN_KEY', 'OPENAI_ADMIN_KEY', 'OPENROUTER_API_KEY', 'CLOUDFLARE_API_TOKEN', 'NEON_API_KEY'])
  })
  it('reads OpenRouter credit', async () => {
    const s = await B.openrouter('k', async () => ({ data: { total_credits: 20, total_usage: 7.5 } }))
    expect(s.balance).toEqual({ amount: 12.5, currency: 'USD' })
  })
  it('sums cost reports from Anthropic (cents) and OpenAI (dollars)', async () => {
    const a = await B.anthropic('k', async (url) => {
      expect(url).toContain('starting_at=2026-10-01T00:00:00Z')
      return { data: [{ results: [{ amount: '1250.5' }, { amount: '49.5' }] }, { results: [{ amount: '100' }] }] }
    }, now)
    expect(a.month).toEqual({ amount: 14, currency: 'USD' })
    const o = await B.openai('k', async () => ({ data: [{ results: [{ amount: { value: 3.2, currency: 'usd' } }] }, { results: [{ amount: { value: 1.3 } }] }] }), now)
    expect(o.month?.amount).toBe(4.5)
  })
  it('turns Cloudflare subscriptions into a monthly cost and lists renewals', async () => {
    const s = await B.cloudflare('t', async (url) => {
      if (url.endsWith('/accounts?per_page=5')) return { result: [{ id: 'a1', name: 'me' }] }
      if (url.includes('subscriptions')) return { result: [{ price: 5, currency: 'USD', frequency: 'monthly', rate_plan: { public_name: 'Workers Paid' }, current_period_end: '2026-11-01T00:00:00Z' }, { price: 120, currency: 'USD', frequency: 'yearly', state: 'Cancelled' }] }
      return { result: [{ name: 'biaze.dev', expires_at: '2027-03-10T00:00:00Z', auto_renew: false }] }
    })
    expect(s.month).toEqual({ amount: 5, currency: 'USD' })
    expect(s.renewals?.map((r) => r.name)).toEqual(['Workers Paid', 'biaze.dev (auto-renew off)'])
  })
  it('keeps one failing source from hiding the rest', async () => {
    const r = await B.all((n) => (n === 'OPENROUTER_API_KEY' ? 'k' : undefined), [{ id: 'f1', name: 'Claude Max', amount: 100, currency: 'USD', day: 5 }], async () => {
      throw new Error('openrouter.ai answered 401')
    }, now)
    expect(r.find((s) => s.id === 'openrouter')?.error).toContain('401')
    expect(r.find((s) => s.id === 'f1')?.month?.amount).toBe(100)
  })
  it('dates fixed charges and totals in one currency', () => {
    expect(B.nextCharge(25, new Date(2026, 9, 23))).toBe('2026-10-25')
    expect(B.nextCharge(5, new Date(2026, 9, 23))).toBe('2026-11-05')
    expect(B.nextCharge(31, new Date(2026, 1, 1))).toBe('2026-02-28')
    const total = B.totalIn([{ id: 'a', name: 'a', kind: 'manual', url: '', month: { amount: 10, currency: 'USD' } }, { id: 'b', name: 'b', kind: 'manual', url: '', month: { amount: 20, currency: 'BRL' } }], 'BRL', { USD: 5.05 })
    expect(total).toBe(70.5)
  })
})
