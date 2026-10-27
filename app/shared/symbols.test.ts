import { describe, expect, it } from 'vitest'
import { fold, fromYahoo, merge, score, searchSymbols, SYMBOLS } from './symbols'
import { normalize } from '../electron/markets'

describe('symbol search', () => {
  it('puts an exact ticker first', () => {
    expect(searchSymbols('wege3')[0]).toMatchObject({ ticker: 'WEGE3', market: 'B3' })
    expect(searchSymbols('AAPL')[0]?.name).toBe('Apple')
  })
  it('finds by name, without accents, in either case', () => {
    expect(searchSymbols('itau').map((s) => s.ticker)).toContain('ITUB4')
    expect(searchSymbols('Apple')[0]?.ticker).toBe('AAPL')
    expect(searchSymbols('bitcoin')[0]?.add).toBe('BTC')
    expect(fold('Itaú')).toBe('itau')
  })
  it('finds by the other names people use', () => {
    expect(searchSymbols('google')[0]?.ticker).toBe('GOOGL')
    expect(searchSymbols('dolar')[0]?.add).toBe('USD')
    expect(searchSymbols('nubank')[0]?.ticker).toBe('NU')
  })
  it('ranks a ticker start above a name match, a short ticker above a long one', () => {
    const r = searchSymbols('pet').map((s) => s.ticker)
    expect(r.slice(0, 2)).toEqual(['PETR4', 'PETR3'])
    const s = SYMBOLS.find((x) => x.ticker === 'PETR4')!
    expect(score(s, 'petr')).toBeGreaterThan(score(s, 'petrobras'))
  })
  it('gives nothing for an empty query and caps the list', () => {
    expect(searchSymbols('  ')).toEqual([])
    expect(searchSymbols('a').length).toBeLessThanOrEqual(8)
  })
  it('only lists symbols the quotes can read', () => {
    for (const s of SYMBOLS) expect(normalize(s.add).symbol, s.add).toBeTruthy()
    expect(normalize('EURUSD=X')).toEqual({ symbol: 'EURUSD=X', label: 'EUR/USD' })
    expect(new Set(SYMBOLS.map((s) => s.add)).size).toBe(SYMBOLS.length)
  })
})

describe('Yahoo lookup', () => {
  const raw = {
    quotes: [
      { symbol: 'TAEE11.SA', shortname: 'TAESA UNT', longname: 'Transmissora Aliança de Energia Elétrica S.A.', quoteType: 'EQUITY', exchange: 'SAO' },
      { symbol: 'SNOW', shortname: 'Snowflake Inc.', quoteType: 'EQUITY', exchange: 'NYQ' },
      { symbol: 'LINK-USD', shortname: 'Chainlink USD', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'CADJPY=X', shortname: 'CAD/JPY', quoteType: 'CURRENCY', exchange: 'CCY' },
      { symbol: 'SNOW240119C00150000', quoteType: 'OPTION' },
      { symbol: 'VOD.L', shortname: 'Vodafone', quoteType: 'EQUITY', exchange: 'LSE', exchDisp: 'London' },
    ],
  }
  it('maps results to what the watchlist takes, dropping options', () => {
    const r = fromYahoo(raw)
    expect(r.map((s) => [s.add, s.market])).toEqual([['TAEE11', 'B3'], ['SNOW', 'US'], ['LINK-USD', 'Crypto'], ['CADJPY=X', 'FX'], ['VOD.L', 'London']])
    expect(r[0]!.name).toMatch(/^Transmissora/)
    expect(r[3]!.ticker).toBe('CAD/JPY')
    expect(fromYahoo(null)).toEqual([])
  })
  it('keeps built-in matches first and drops lookups already shown', () => {
    const local = searchSymbols('vale')
    const m = merge(local, [{ add: 'VALE3', ticker: 'VALE3', name: 'x', market: 'B3' }, { add: 'VALE', ticker: 'VALE', name: 'Vale S.A. ADR', market: 'US' }])
    expect(m.filter((s) => s.add === 'VALE3')).toHaveLength(1)
    expect(m.at(-1)?.add).toBe('VALE')
  })
})

import { monogram } from './feeds'
describe('feed monogram', () => {
  it('takes two initials or the first two letters', () => {
    expect(monogram('Hacker News')).toBe('HN')
    expect(monogram('Cloudflare')).toBe('CL')
    expect(monogram('  ')).toBe('?')
    expect(monogram('Ars · Technica')).toBe('AT')
  })
})
