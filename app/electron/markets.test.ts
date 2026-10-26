import { describe, expect, it } from 'vitest'
import * as M from './markets'

describe('markets', () => {
  it('spells symbols the way Yahoo does', () => {
    expect(M.normalize('petr4')).toEqual({ symbol: 'PETR4.SA', label: 'PETR4' })
    expect(M.normalize('TAEE11')).toEqual({ symbol: 'TAEE11.SA', label: 'TAEE11' })
    expect(M.normalize('usd')).toEqual({ symbol: 'USDBRL=X', label: 'USD/BRL' })
    expect(M.normalize('BTC')).toEqual({ symbol: 'BTC-BRL', label: 'BTC' })
    expect(M.normalize('IBOV').symbol).toBe('^BVSP')
    expect(M.normalize('AAPL').symbol).toBe('AAPL')
  })
  it('reads a chart and computes the day change', async () => {
    const q = await M.yahoo('PETR4.SA', 'PETR4', async () => ({ chart: { result: [{ meta: { regularMarketPrice: 55, chartPreviousClose: 50, currency: 'BRL', regularMarketTime: 1 }, indicators: { quote: [{ close: [50, null, 53, 55] }] } }] } }))
    expect(q).toMatchObject({ price: 55, change: 5, changePct: 10, points: [50, 53, 55] })
  })
  it('falls back to brapi for B3 and names what failed', async () => {
    const get = async (url: string) => {
      if (url.includes('yahoo')) throw new Error('yahoo answered 429')
      return { results: [{ regularMarketPrice: 57.83, regularMarketChange: 0.08, regularMarketChangePercent: 0.14, currency: 'BRL', regularMarketTime: '2026-10-22T20:00:00Z' }] }
    }
    const r = await M.quotes(['PETR4', 'AAPL'], get)
    expect(r.quotes[0]).toMatchObject({ label: 'PETR4', price: 57.83, source: 'brapi' })
    expect(r.errors).toEqual([{ symbol: 'AAPL', error: 'yahoo answered 429' }])
  })
  it('reads crypto from CoinGecko', async () => {
    const r = await M.quotes(['BTC'], async (url) => {
      expect(url).toContain('coins/bitcoin/market_chart?vs_currency=brl')
      return { prices: [[1, 400000], [2, 401000], [3, 402000], [4, 404000]] }
    })
    expect(r.quotes[0]).toMatchObject({ label: 'BTC', price: 404000, change: 4000, changePct: 1, source: 'coingecko' })
  })
  it('reads Polymarket markets and their odds', async () => {
    const r = await M.predictions('rate', async () => [
      { id: '1', question: 'Fed cuts rates in December?', slug: 'fed-dec', outcomes: '["Yes","No"]', outcomePrices: '["0.62","0.38"]', volume24hr: 1200000, endDate: '2026-12-10T00:00:00Z', closed: false },
      { id: '2', question: 'Lakers win?', slug: 'lal', outcomes: '["Yes","No"]', outcomePrices: '["0.4","0.6"]', volume24hr: 9, endDate: '', closed: false },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ question: 'Fed cuts rates in December?', outcomes: [{ name: 'Yes', p: 0.62 }, { name: 'No', p: 0.38 }], url: 'https://polymarket.com/market/fed-dec' })
  })
  it.runIf(process.env.STM_NET)('reads real Polymarket markets', async () => {
    const r = await M.predictions()
    expect(r.length).toBeGreaterThan(3)
    expect(r[0]!.outcomes.length).toBeGreaterThan(1)
  }, 20_000)
  it.runIf(process.env.STM_NET)('reads real quotes', async () => {
    const r = await M.quotes(['PETR4', 'USD', 'BTC', 'IBOV'])
    expect(r.quotes.length).toBe(4)
    expect(r.quotes.every((q) => q.price > 0)).toBe(true)
  }, 30_000)
})
