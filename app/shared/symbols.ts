// The Markets add field's suggestions: a built-in list of common symbols, ranked as the person types,
// and the shape of Yahoo Finance's symbol search (the same free source the quotes come from) for
// anything not in the list. `add` is what goes into the watchlist: what `normalize` in
// electron/markets.ts understands.

/** B3, US, Crypto, FX, Index, or the exchange Yahoo names for anything else. */
export type Market = 'B3' | 'US' | 'Crypto' | 'FX' | 'Index' | (string & {})
export type Sym = { add: string; ticker: string; name: string; market: Market; aka?: string }

const b3 = (ticker: string, name: string, aka?: string): Sym => ({ add: ticker, ticker, name, market: 'B3', aka })
const us = (ticker: string, name: string, aka?: string): Sym => ({ add: ticker, ticker, name, market: 'US', aka })

export const SYMBOLS: Sym[] = [
  // indexes
  { add: 'IBOV', ticker: 'IBOV', name: 'Ibovespa', market: 'Index', aka: 'bovespa b3' },
  { add: 'IFIX', ticker: 'IFIX', name: 'IFIX real estate funds', market: 'Index', aka: 'fii' },
  { add: 'SP500', ticker: 'SP500', name: 'S&P 500', market: 'Index', aka: 'spx gspc' },
  { add: 'NASDAQ', ticker: 'NASDAQ', name: 'Nasdaq Composite', market: 'Index', aka: 'ixic' },
  { add: 'DOW', ticker: 'DOW', name: 'Dow Jones Industrial Average', market: 'Index', aka: 'dji' },
  { add: '^RUT', ticker: '^RUT', name: 'Russell 2000', market: 'Index' },
  { add: '^VIX', ticker: '^VIX', name: 'CBOE Volatility Index', market: 'Index', aka: 'vix' },
  { add: '^FTSE', ticker: '^FTSE', name: 'FTSE 100', market: 'Index', aka: 'london' },
  { add: '^GDAXI', ticker: '^GDAXI', name: 'DAX', market: 'Index', aka: 'germany' },
  { add: '^N225', ticker: '^N225', name: 'Nikkei 225', market: 'Index', aka: 'japan' },
  // currencies (in reais unless named)
  { add: 'USD', ticker: 'USD/BRL', name: 'US dollar in reais', market: 'FX', aka: 'dolar dollar' },
  { add: 'EUR', ticker: 'EUR/BRL', name: 'Euro in reais', market: 'FX', aka: 'euro' },
  { add: 'GBP', ticker: 'GBP/BRL', name: 'British pound in reais', market: 'FX', aka: 'libra pound' },
  { add: 'JPY', ticker: 'JPY/BRL', name: 'Japanese yen in reais', market: 'FX', aka: 'iene yen' },
  { add: 'ARS', ticker: 'ARS/BRL', name: 'Argentine peso in reais', market: 'FX', aka: 'peso' },
  { add: 'EURUSD=X', ticker: 'EUR/USD', name: 'Euro in US dollars', market: 'FX', aka: 'euro dollar' },
  { add: 'GBPUSD=X', ticker: 'GBP/USD', name: 'British pound in US dollars', market: 'FX', aka: 'cable' },
  { add: 'USDJPY=X', ticker: 'USD/JPY', name: 'US dollar in yen', market: 'FX' },
  // crypto (in reais)
  { add: 'BTC', ticker: 'BTC', name: 'Bitcoin', market: 'Crypto' },
  { add: 'ETH', ticker: 'ETH', name: 'Ethereum', market: 'Crypto' },
  { add: 'SOL', ticker: 'SOL', name: 'Solana', market: 'Crypto' },
  { add: 'XRP', ticker: 'XRP', name: 'XRP', market: 'Crypto', aka: 'ripple' },
  { add: 'BNB', ticker: 'BNB', name: 'BNB', market: 'Crypto', aka: 'binance' },
  { add: 'ADA', ticker: 'ADA', name: 'Cardano', market: 'Crypto' },
  { add: 'DOGE', ticker: 'DOGE', name: 'Dogecoin', market: 'Crypto' },
  { add: 'USDT', ticker: 'USDT', name: 'Tether', market: 'Crypto', aka: 'stablecoin' },
  // B3
  b3('PETR4', 'Petrobras PN', 'petroleo'), b3('PETR3', 'Petrobras ON', 'petroleo'), b3('VALE3', 'Vale ON', 'mineracao'),
  b3('ITUB4', 'Itaú Unibanco PN', 'itau banco'), b3('BBDC4', 'Bradesco PN', 'banco'), b3('BBAS3', 'Banco do Brasil ON', 'banco bb'),
  b3('SANB11', 'Santander Brasil', 'banco'), b3('BPAC11', 'BTG Pactual', 'banco'), b3('ITSA4', 'Itaúsa PN', 'itausa'),
  b3('B3SA3', 'B3 ON', 'bolsa'), b3('ABEV3', 'Ambev ON', 'cerveja'), b3('WEGE3', 'WEG ON'),
  b3('RENT3', 'Localiza ON'), b3('SUZB3', 'Suzano ON', 'papel celulose'), b3('JBSS3', 'JBS ON'),
  b3('ELET3', 'Eletrobras ON', 'energia'), b3('EQTL3', 'Equatorial ON', 'energia'), b3('PRIO3', 'PRIO ON', 'petroleo petrorio'),
  b3('RADL3', 'Raia Drogasil ON', 'farmacia'), b3('RAIL3', 'Rumo ON'), b3('GGBR4', 'Gerdau PN', 'aco'),
  b3('CSNA3', 'CSN ON', 'siderurgica aco'), b3('MGLU3', 'Magazine Luiza ON', 'magalu'), b3('LREN3', 'Lojas Renner ON'),
  b3('VIVT3', 'Telefônica Brasil ON', 'vivo telefonica'), b3('TIMS3', 'TIM ON'), b3('SBSP3', 'Sabesp ON', 'saneamento'),
  b3('CMIG4', 'Cemig PN', 'energia'), b3('HAPV3', 'Hapvida ON', 'saude'), b3('RDOR3', "Rede D'Or ON", 'saude hospital'),
  b3('EMBR3', 'Embraer ON', 'avioes'), b3('TOTS3', 'Totvs ON', 'software'), b3('BBSE3', 'BB Seguridade ON', 'seguros'),
  b3('KLBN11', 'Klabin', 'papel'), b3('UGPA3', 'Ultrapar ON', 'ipiranga'), b3('CPLE6', 'Copel PNB', 'energia'),
  b3('ASAI3', 'Assaí ON', 'assai atacadista'), b3('CSAN3', 'Cosan ON'), b3('NTCO3', 'Natura ON', 'natura'),
  b3('BOVA11', 'iShares Ibovespa ETF', 'etf ibovespa'), b3('IVVB11', 'iShares S&P 500 ETF (B3)', 'etf sp500'),
  // US
  us('AAPL', 'Apple'), us('MSFT', 'Microsoft'), us('NVDA', 'Nvidia'), us('GOOGL', 'Alphabet (Google)', 'google'),
  us('AMZN', 'Amazon'), us('META', 'Meta Platforms', 'facebook'), us('TSLA', 'Tesla'), us('BRK-B', 'Berkshire Hathaway B', 'buffett'),
  us('AVGO', 'Broadcom'), us('JPM', 'JPMorgan Chase'), us('V', 'Visa'), us('MA', 'Mastercard'),
  us('LLY', 'Eli Lilly'), us('UNH', 'UnitedHealth'), us('XOM', 'Exxon Mobil'), us('WMT', 'Walmart'),
  us('JNJ', 'Johnson & Johnson'), us('PG', 'Procter & Gamble'), us('HD', 'Home Depot'), us('COST', 'Costco'),
  us('NFLX', 'Netflix'), us('AMD', 'Advanced Micro Devices'), us('INTC', 'Intel'), us('ORCL', 'Oracle'),
  us('CRM', 'Salesforce'), us('ADBE', 'Adobe'), us('KO', 'Coca-Cola'), us('PEP', 'PepsiCo'),
  us('DIS', 'Walt Disney', 'disney'), us('BA', 'Boeing'), us('NKE', 'Nike'), us('UBER', 'Uber'),
  us('PLTR', 'Palantir'), us('COIN', 'Coinbase'), us('SHOP', 'Shopify'), us('TSM', 'TSMC', 'taiwan semiconductor'),
  us('NU', 'Nu Holdings (Nubank)', 'nubank'), us('MELI', 'MercadoLibre', 'mercado livre'),
  us('SPY', 'SPDR S&P 500 ETF', 'etf'), us('QQQ', 'Invesco QQQ (Nasdaq 100)', 'etf'),
]

/** Lower case without accents, so "itau" finds Itaú. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** How well a symbol answers the query; 0 is no match. Ticker beats name, a start beats a middle. */
export function score(s: Sym, query: string): number {
  const q = fold(query.trim())
  if (!q) return 0
  const t = fold(s.ticker)
  const a = fold(s.add)
  const name = fold(s.name)
  if (t === q || a === q) return 100
  if (t.startsWith(q) || a.startsWith(q)) return 80 - Math.min(10, t.length - q.length)
  if (name.startsWith(q)) return 60
  const words = `${name} ${fold(s.aka ?? '')}`.split(/[^a-z0-9&]+/)
  if (words.some((w) => w.startsWith(q))) return 50
  if (name.includes(q)) return 30
  if (t.includes(q)) return 20
  return 0
}

/** The best matches from a list, best first; ties keep the list's order. */
export function searchSymbols(query: string, list: Sym[] = SYMBOLS, limit = 8): Sym[] {
  return list
    .map((s, i) => ({ s, i, n: score(s, query) }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n || x.i - y.i)
    .slice(0, limit)
    .map((x) => x.s)
}

type YahooQuote = { symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchange?: string; exchDisp?: string }

/** Yahoo's search answer as suggestions; options, futures and funds without a quote are left out. */
export function fromYahoo(raw: unknown): Sym[] {
  const quotes = ((raw as { quotes?: YahooQuote[] })?.quotes ?? []).filter((q) => q.symbol && /^(EQUITY|ETF|INDEX|CURRENCY|CRYPTOCURRENCY|MUTUALFUND)$/.test(q.quoteType ?? ''))
  return quotes.map((q) => {
    const symbol = q.symbol!.toUpperCase()
    const name = q.longname || q.shortname || symbol
    if (symbol.endsWith('.SA')) return { add: symbol.slice(0, -3), ticker: symbol.slice(0, -3), name, market: q.quoteType === 'INDEX' ? 'Index' : 'B3' }
    if (q.quoteType === 'INDEX') return { add: symbol, ticker: symbol, name, market: 'Index' }
    if (q.quoteType === 'CURRENCY') return { add: symbol, ticker: symbol.replace(/^([A-Z]{3})([A-Z]{3})=X$/, '$1/$2'), name, market: 'FX' }
    if (q.quoteType === 'CRYPTOCURRENCY') return { add: symbol, ticker: symbol, name, market: 'Crypto' }
    return { add: symbol, ticker: symbol, name, market: q.exchange && /^(NMS|NYQ|NGM|NCM|ASE|PCX|BTS|NAS|NYS)$/.test(q.exchange) ? 'US' : (q.exchDisp || 'Other') }
  })
}

/** Built-in matches first, then what the lookup found that is not already there. */
export function merge(local: Sym[], remote: Sym[], limit = 8): Sym[] {
  const seen = new Set(local.map((s) => s.add.toUpperCase()))
  return [...local, ...remote.filter((s) => !seen.has(s.add.toUpperCase()))].slice(0, limit)
}
