// The backtest lab: strategies run on past prices only, never an order to a broker. Signals are computed
// on a bar's close and filled at the next bar's open (no look-ahead), long only, no leverage, with a fee
// per trade. NautilusTrader (LGPL-3.0) is offered as a script for your own Python environment.

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number }
export type Strategy = { kind: 'sma-cross'; fast: number; slow: number } | { kind: 'rsi'; period: number; buyBelow: number; sellAbove: number } | { kind: 'hold' }
export type Trade = { entry: number; exit: number; entryPrice: number; exitPrice: number; ret: number }
export type Result = { equity: [number, number][]; benchmark: [number, number][]; trades: Trade[]; stats: { totalReturn: number; cagr: number; maxDrawdown: number; sharpe: number; trades: number; winRate: number; exposure: number; benchmarkReturn: number } }

/** Bars from a CSV with a header: date/time, open, high, low, close[, volume]; sorted by time. */
export function parseBars(csv: string): Bar[] {
  const lines = csv.trim().split(/\r?\n/)
  const head = (lines.shift() ?? '').toLowerCase().split(/[,;\t]/).map((s) => s.trim().replace(/"/g, ''))
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const it = col('date', 'time', 'timestamp', 'datetime')
  const io = col('open', 'o')
  const ih = col('high', 'h')
  const il = col('low', 'l')
  const ic = col('close', 'c', 'adj close', 'adj_close')
  const iv = col('volume', 'v')
  if (it < 0 || ic < 0) throw new Error('The CSV needs a date column and a close column.')
  const bars = lines
    .map((l) => l.split(/[,;\t]/).map((s) => s.trim().replace(/"/g, '')))
    .map((f) => {
      const raw = f[it]!
      const t = /^\d{10}$/.test(raw) ? Number(raw) * 1000 : /^\d{13}$/.test(raw) ? Number(raw) : Date.parse(raw)
      const c = Number(f[ic])
      return { t, o: io >= 0 ? Number(f[io]) : c, h: ih >= 0 ? Number(f[ih]) : c, l: il >= 0 ? Number(f[il]) : c, c, v: iv >= 0 ? Number(f[iv]) || 0 : 0 }
    })
    .filter((b) => Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0)
  return bars.sort((a, b) => a.t - b.t)
}

export const sma = (xs: number[], n: number) => xs.map((_, i) => (i + 1 < n ? NaN : xs.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n))
export function rsi(xs: number[], n: number): number[] {
  const out = xs.map(() => NaN)
  let gain = 0
  let loss = 0
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i]! - xs[i - 1]!
    if (i <= n) {
      gain += Math.max(0, d)
      loss += Math.max(0, -d)
      if (i === n) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / n / (loss / n))
      continue
    }
    gain = (gain * (n - 1) + Math.max(0, d)) / n
    loss = (loss * (n - 1) + Math.max(0, -d)) / n
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  // the first value above used sums; keep the smoothed averages from here
  return out
}

/** Whether to be in the market after each bar's close. */
function wants(bars: Bar[], s: Strategy): boolean[] {
  const c = bars.map((b) => b.c)
  if (s.kind === 'hold') return c.map(() => true)
  if (s.kind === 'sma-cross') {
    const f = sma(c, s.fast)
    const sl = sma(c, s.slow)
    return c.map((_, i) => Number.isFinite(sl[i]!) && f[i]! > sl[i]!)
  }
  const r = rsi(c, s.period)
  const out: boolean[] = []
  let inside = false
  for (let i = 0; i < c.length; i++) {
    if (!inside && r[i]! < s.buyBelow) inside = true
    else if (inside && r[i]! > s.sellAbove) inside = false
    out.push(inside)
  }
  return out
}

/** The simulation: signal on close, fill at the next open, fee in basis points per side. */
export function backtest(bars: Bar[], s: Strategy, feeBps = 10, startCash = 10_000): Result {
  if (bars.length < 3) throw new Error('Not enough bars.')
  const want = wants(bars, s)
  const fee = feeBps / 10_000
  let cash = startCash
  let units = 0
  let open: { i: number; price: number } | null = null
  const trades: Trade[] = []
  const equity: [number, number][] = []
  let inBars = 0
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!
    const signal = i > 0 ? want[i - 1]! : false
    if (signal && units === 0) {
      units = (cash * (1 - fee)) / b.o
      cash = 0
      open = { i, price: b.o }
    } else if (!signal && units > 0) {
      cash = units * b.o * (1 - fee)
      trades.push({ entry: bars[open!.i]!.t, exit: b.t, entryPrice: open!.price, exitPrice: b.o, ret: (b.o * (1 - fee) * (1 - fee)) / open!.price - 1 })
      units = 0
      open = null
    }
    if (units > 0) inBars++
    equity.push([b.t, cash + units * b.c])
  }
  const last = bars[bars.length - 1]!
  if (units > 0 && open) trades.push({ entry: bars[open.i]!.t, exit: last.t, entryPrice: open.price, exitPrice: last.c, ret: (last.c * (1 - fee) * (1 - fee)) / open.price - 1 })
  const end = equity[equity.length - 1]![1]
  const years = Math.max(1 / 365, (last.t - bars[0]!.t) / (365.25 * 86_400_000))
  let peak = -Infinity
  let mdd = 0
  for (const [, v] of equity) {
    peak = Math.max(peak, v)
    mdd = Math.min(mdd, v / peak - 1)
  }
  const rets = equity.slice(1).map(([, v], i) => v / equity[i]![1] - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length)
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1))
  const perYear = rets.length / years
  return {
    equity,
    benchmark: bars.map((b) => [b.t, (startCash * b.c) / bars[0]!.c]),
    trades,
    stats: {
      totalReturn: end / startCash - 1,
      cagr: (end / startCash) ** (1 / years) - 1,
      maxDrawdown: mdd,
      sharpe: sd > 0 ? (mean / sd) * Math.sqrt(perYear) : 0,
      trades: trades.length,
      winRate: trades.length ? trades.filter((t) => t.ret > 0).length / trades.length : 0,
      exposure: inBars / bars.length,
      benchmarkReturn: last.c / bars[0]!.c - 1,
    },
  }
}

/** A NautilusTrader script for your own environment: the same idea, run by their engine, simulated only. */
export function nautilusScript(s: Strategy, csvName: string): string {
  const fast = s.kind === 'sma-cross' ? s.fast : 10
  const slow = s.kind === 'sma-cross' ? s.slow : 30
  return `# Backtest with NautilusTrader (LGPL-3.0), in your own Python environment:
#   python -m venv .venv && . .venv/bin/activate && pip install nautilus_trader pandas
# Simulated only: a BacktestEngine with a simulated venue; nothing connects to a broker.
# Written by SuperTokenMan as a starting point; check it against NautilusTrader's docs for your version.
import pandas as pd
from nautilus_trader.backtest.engine import BacktestEngine, BacktestEngineConfig
from nautilus_trader.examples.strategies.ema_cross import EMACross, EMACrossConfig
from nautilus_trader.model.currencies import USD
from nautilus_trader.model.enums import AccountType, OmsType
from nautilus_trader.model.identifiers import Venue
from nautilus_trader.model.objects import Money
from nautilus_trader.persistence.wranglers import BarDataWrangler
from nautilus_trader.test_kit.providers import TestInstrumentProvider
from nautilus_trader.model.data import BarType

engine = BacktestEngine(config=BacktestEngineConfig(trader_id="BACKTESTER-001"))
venue = Venue("SIM")
engine.add_venue(venue=venue, oms_type=OmsType.NETTING, account_type=AccountType.CASH, base_currency=USD, starting_balances=[Money(10_000, USD)])
instrument = TestInstrumentProvider.equity(symbol="ASSET", venue="SIM")
engine.add_instrument(instrument)
bar_type = BarType.from_str(f"{instrument.id}-1-DAY-LAST-EXTERNAL")
df = pd.read_csv("${csvName}", parse_dates=[0], index_col=0)
df.columns = [c.lower() for c in df.columns]
engine.add_data(BarDataWrangler(bar_type, instrument).process(df))
engine.add_strategy(EMACross(EMACrossConfig(instrument_id=instrument.id, bar_type=bar_type, trade_size=1, fast_ema_period=${fast}, slow_ema_period=${slow})))
engine.run()
print(engine.trader.generate_account_report(venue))
`
}
