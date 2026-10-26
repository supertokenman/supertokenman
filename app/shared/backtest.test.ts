import { describe, expect, it } from 'vitest'
import { backtest, nautilusScript, parseBars, rsi, sma } from './backtest'

const day = (i: number) => Date.UTC(2025, 0, 1) + i * 86_400_000
const series = (closes: number[]) => closes.map((c, i) => ({ t: day(i), o: c, h: c, l: c, c, v: 0 }))

describe('backtest lab', () => {
  it('parses CSV bars in time order', () => {
    const b = parseBars('Date,Open,High,Low,Close,Volume\n2025-01-03,3,3,3,3,9\n2025-01-02,2,2,2,2,8\nbad,x,x,x,x,x')
    expect(b.map((x) => x.c)).toEqual([2, 3])
    expect(() => parseBars('a,b\n1,2')).toThrow(/date column/)
  })
  it('computes indicators', () => {
    expect(sma([1, 2, 3, 4], 2).slice(1)).toEqual([1.5, 2.5, 3.5])
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[3]).toBe(100)
  })
  it('fills at the next open, never on the signal bar', () => {
    // price jumps on bar 3; a strategy that wants in from bar 0 buys at bar 1's open
    const r = backtest(series([10, 10, 10, 20, 20]), { kind: 'hold' }, 0)
    expect(r.trades[0]!.entryPrice).toBe(10)
    expect(r.stats.totalReturn).toBeCloseTo(1)
    expect(r.stats.benchmarkReturn).toBeCloseTo(1)
  })
  it('trades a crossover with fees and measures drawdown', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i)
    const down = Array.from({ length: 30 }, (_, i) => 129 - i * 2)
    const r = backtest(series([...up, ...down]), { kind: 'sma-cross', fast: 3, slow: 8 }, 10)
    expect(r.stats.trades).toBe(1)
    expect(r.trades[0]!.exit).toBeGreaterThan(r.trades[0]!.entry)
    expect(r.stats.maxDrawdown).toBeLessThan(0)
    expect(r.stats.exposure).toBeGreaterThan(0)
    expect(r.equity.length).toBe(60)
  })
  it('writes a simulated-only Nautilus script', () => {
    const s = nautilusScript({ kind: 'sma-cross', fast: 5, slow: 20 }, 'prices.csv')
    expect(s).toContain('fast_ema_period=5')
    expect(s).toContain('Simulated only')
    expect(s).not.toMatch(/live|LiveNode|api_key/i)
  })
})
