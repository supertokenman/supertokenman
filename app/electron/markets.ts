// Quotes for free: Yahoo Finance's public chart endpoint covers B3, US stocks, indices, currencies and
// indices in one shape; brapi answers for B3 when Yahoo does not; CoinGecko has crypto in reais. No key, no account. Neither is an
// official feed: quotes can lag and the endpoints can change.

import { fromYahoo, type Sym } from '../shared/symbols.js'

export type Quote = { symbol: string; label: string; price: number; change: number; changePct: number; currency: string; points: number[]; time: number; source: 'yahoo' | 'brapi' | 'coingecko' }

/** What the user types, as Yahoo spells it: PETR4 is PETR4.SA, BTC is BTC-BRL, USD is USDBRL=X. */
export function normalize(input: string): { symbol: string; label: string } {
  const s = input.trim().toUpperCase()
  const fx: Record<string, string> = { USD: 'USDBRL=X', EUR: 'EURBRL=X', GBP: 'GBPBRL=X', JPY: 'JPYBRL=X', ARS: 'ARSBRL=X' }
  const index: Record<string, string> = { IBOV: '^BVSP', IBOVESPA: '^BVSP', SP500: '^GSPC', 'S&P500': '^GSPC', NASDAQ: '^IXIC', DOW: '^DJI', IFIX: 'IFIX.SA' }
  const crypto = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'USDT', 'BNB']
  if (fx[s]) return { symbol: fx[s], label: `${s}/BRL` }
  if (index[s]) return { symbol: index[s], label: s === 'IBOVESPA' ? 'IBOV' : s }
  if (crypto.includes(s)) return { symbol: `${s}-BRL`, label: s }
  if (/^[A-Z]{6}=X$/.test(s)) return { symbol: s, label: `${s.slice(0, 3)}/${s.slice(3, 6)}` }
  if (/^[A-Z]{4}\d{1,2}F?$/.test(s)) return { symbol: `${s}.SA`, label: s }
  return { symbol: s, label: s.replace(/\.SA$/, '') }
}

type Get = (url: string) => Promise<unknown>
const getJson: Get = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SuperTokenMan', Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`)
  return r.json()
}

type Chart = { chart: { result?: { meta: { regularMarketPrice: number; chartPreviousClose?: number; previousClose?: number; currency: string; regularMarketTime: number }; indicators: { quote: { close: (number | null)[] }[] } }[]; error?: { description: string } } }

export async function yahoo(symbol: string, label: string, get: Get = getJson): Promise<Quote> {
  const j = (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`)) as Chart
  const r = j.chart.result?.[0]
  if (!r) throw new Error(j.chart.error?.description ?? `no data for ${symbol}`)
  const prev = r.meta.chartPreviousClose ?? r.meta.previousClose ?? r.meta.regularMarketPrice
  const price = r.meta.regularMarketPrice
  return {
    symbol,
    label,
    price,
    change: price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    currency: r.meta.currency,
    points: (r.indicators.quote[0]?.close ?? []).filter((x): x is number => typeof x === 'number'),
    time: r.meta.regularMarketTime * 1000,
    source: 'yahoo',
  }
}

const COINS: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', USDT: 'tether', BNB: 'binancecoin' }

/** A coin in reais over the last day, from CoinGecko's free public API. */
export async function coingecko(coin: string, label: string, get: Get = getJson): Promise<Quote> {
  const id = COINS[coin]
  if (!id) throw new Error(`unknown coin ${coin}`)
  const j = (await get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=brl&days=1`)) as { prices?: [number, number][] }
  const pts = (j.prices ?? []).map((p) => p[1])
  if (!pts.length) throw new Error(`no data for ${coin}`)
  const price = pts.at(-1)!
  const first = pts[0]!
  // a point every ~5 minutes: thinned to about one every 15, like the stock charts
  return { symbol: `${coin}-BRL`, label, price, change: price - first, changePct: ((price - first) / first) * 100, currency: 'BRL', points: pts.filter((_, i) => i % 3 === 0), time: (j.prices!.at(-1)![0]), source: 'coingecko' }
}

export async function brapi(ticker: string, label: string, get: Get = getJson): Promise<Quote> {
  const j = (await get(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`)) as { results?: { regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number; currency: string; regularMarketTime: string }[] }
  const r = j.results?.[0]
  if (!r) throw new Error(`no data for ${ticker}`)
  return { symbol: ticker, label, price: r.regularMarketPrice, change: r.regularMarketChange, changePct: r.regularMarketChangePercent, currency: r.currency, points: [], time: Date.parse(r.regularMarketTime) || Date.now(), source: 'brapi' }
}

/** Every symbol at once; a B3 ticker Yahoo cannot answer is asked of brapi; failures come back named. */
export async function quotes(inputs: string[], get: Get = getJson): Promise<{ quotes: Quote[]; errors: { symbol: string; error: string }[] }> {
  const res = await Promise.allSettled(
    inputs.map(async (i) => {
      const { symbol, label } = normalize(i)
      if (symbol.endsWith('-BRL') && COINS[label]) return coingecko(label, label, get)
      try {
        return await yahoo(symbol, label, get)
      } catch (e) {
        if (symbol.endsWith('.SA')) return brapi(symbol.slice(0, -3), label, get)
        throw e
      }
    }),
  )
  return {
    quotes: res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    errors: res.flatMap((r, i) => (r.status === 'rejected' ? [{ symbol: inputs[i]!, error: (r.reason as Error).message }] : [])),
  }
}

/**
 * Symbols matching what the person typed, from Yahoo Finance's public search (the quotes' own source).
 * Only called from the Markets add field, after a pause in typing, when the built-in list has too few.
 */
export async function searchSymbols(q: string, get: Get = getJson): Promise<Sym[]> {
  const t = q.trim().slice(0, 40)
  if (t.length < 2) return []
  return fromYahoo(await get(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(t)}&quotesCount=8&newsCount=0&listsCount=0`))
}

export const DEFAULT_WATCH = ['IBOV', 'USD', 'EUR', 'BTC', 'ETH', 'PETR4', 'VALE3', 'ITUB4', 'NASDAQ']

export type Prediction = { id: string; question: string; outcomes: { name: string; p: number }[]; volume24h: number; ends: string; url: string; image?: string }

/** Polymarket's busiest open markets, from its public Gamma API: read-only, no account, no key. */
export async function predictions(filter = '', get: Get = getJson): Promise<Prediction[]> {
  type Raw = { id: string; question: string; slug: string; outcomes: string; outcomePrices: string; volume24hr?: number; endDate: string; icon?: string; closed: boolean }
  const raw = (await get('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=100')) as Raw[]
  const f = filter.trim().toLowerCase()
  return raw
    .filter((m) => !m.closed && (!f || m.question.toLowerCase().includes(f)))
    .slice(0, 12)
    .map((m) => {
      let names: string[] = []
      let prices: number[] = []
      try {
        names = JSON.parse(m.outcomes) as string[]
        prices = (JSON.parse(m.outcomePrices) as string[]).map(Number)
      } catch {
        // a market without prices yet shows no bars
      }
      return { id: m.id, question: m.question, outcomes: names.map((name, i) => ({ name, p: prices[i] ?? 0 })), volume24h: m.volume24hr ?? 0, ends: m.endDate, url: `https://polymarket.com/market/${m.slug}`, image: m.icon }
    })
}
