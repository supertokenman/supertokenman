import { useState } from 'react'
import { backtest, nautilusScript, parseBars, type Bar, type Result, type Strategy } from '../shared/backtest'
import { Chart, Stat } from './Chart'
import { clean } from './errors'
import { IconClose, IconTest } from './icons'
import './bridge'
import { NumberField, Select } from './ui'

const pct = (x: number) => Number((x * 100).toFixed(1))

/**
 * The backtest lab: load past prices (CSV), pick a strategy, and see what it would have done. Simulation
 * only: nothing here talks to a broker or places an order. Fills happen at the next bar's open.
 */
export function BacktestSheet(props: { cwd?: string; onClose: () => void }) {
  const [bars, setBars] = useState<Bar[] | null>(null)
  const [file, setFile] = useState('')
  const [s, setS] = useState<Strategy>({ kind: 'sma-cross', fast: 20, slow: 50 })
  const [fee, setFee] = useState(10)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const load = (f: File) => {
    setErr('')
    setRes(null)
    void f.text().then((t) => {
      try {
        const b = parseBars(t)
        setBars(b)
        setFile(f.name)
      } catch (e) {
        setErr(clean(e))
      }
    })
  }
  const run = () => {
    try {
      setErr('')
      setRes(backtest(bars!, s, fee))
    } catch (e) {
      setErr(clean(e))
    }
  }
  const num = (k: string, v: number, on: (n: number) => void) => <label className="fld"><span className="fld-label">{k}</span><NumberField min={1} value={v} onChange={(e) => on(Number(e.target.value) || 1)} /></label>
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe btl" role="dialog" aria-label="Backtest lab">
        <header className="sheet-head">
          <div className="sheet-title">Backtest lab</div>
          <span className="bt-sim">Simulation only · no broker, no orders</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <div className="fld-grid">
            <label className="fld wide"><span className="fld-label">Prices (CSV with date, open, high, low, close)</span><input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /><span className="fld-help">{bars ? `${file}: ${bars.length} bars, ${new Date(bars[0]!.t).toISOString().slice(0, 10)} to ${new Date(bars[bars.length - 1]!.t).toISOString().slice(0, 10)}` : 'Export daily bars from your data source; nothing is fetched from the internet.'}</span></label>
            <label className="fld"><span className="fld-label">Strategy</span>
              <Select value={s.kind} onChange={(e) => setS(e.target.value === 'rsi' ? { kind: 'rsi', period: 14, buyBelow: 30, sellAbove: 55 } : e.target.value === 'hold' ? { kind: 'hold' } : { kind: 'sma-cross', fast: 20, slow: 50 })}>
                <option value="sma-cross">Moving average cross</option><option value="rsi">RSI mean reversion</option><option value="hold">Buy and hold</option>
              </Select>
            </label>
            {s.kind === 'sma-cross' && <>{num('Fast average', s.fast, (n) => setS({ ...s, fast: n }))}{num('Slow average', s.slow, (n) => setS({ ...s, slow: n }))}</>}
            {s.kind === 'rsi' && <>{num('RSI period', s.period, (n) => setS({ ...s, period: n }))}{num('Buy below', s.buyBelow, (n) => setS({ ...s, buyBelow: n }))}{num('Sell above', s.sellAbove, (n) => setS({ ...s, sellAbove: n }))}</>}
            <label className="fld"><span className="fld-label">Fee per side (bps)</span><NumberField min={0} value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} /></label>
          </div>
          <div className="ob-row">
            {props.cwd && <button className="ghost small" onClick={() => void window.stm.backtest.saveScript(props.cwd!, s.kind, nautilusScript(s, file || 'prices.csv')).then((f) => setMsg(`Saved ${f}: run it in your own Python environment.`), (e) => setErr(clean(e)))}>Save a NautilusTrader script</button>}
            <span className="spacer-flex" />
            <button className="primary small" disabled={!bars} onClick={run}><IconTest />Run the backtest</button>
          </div>
          {err && <div className="notice error">{err}</div>}
          {msg && <div className="notice">{msg}</div>}
          {res && (
            <>
              <div className="ar-stats">
                <Stat label="Total return" value={pct(res.stats.totalReturn)} unit="%" />
                <Stat label="Buy and hold" value={pct(res.stats.benchmarkReturn)} unit="%" />
                <Stat label="Yearly (CAGR)" value={pct(res.stats.cagr)} unit="%" />
                <Stat label="Max drawdown" value={pct(res.stats.maxDrawdown)} unit="%" />
                <Stat label="Sharpe" value={Number(res.stats.sharpe.toFixed(2))} />
                <Stat label="Trades" value={res.stats.trades} unit={`· ${pct(res.stats.winRate)}% won`} />
              </div>
              <Chart kind="line" time label="Equity, strategy and buy and hold (start 10,000)" series={[{ name: 'strategy', points: res.equity }, { name: 'buy and hold', points: res.benchmark }]} height={260} />
              <details><summary className="faint">{res.trades.length} trades</summary>
                <div className="dbv-grid" style={{ maxHeight: 220 }}><table><thead><tr><th>In</th><th>Out</th><th>Entry</th><th>Exit</th><th>Return</th></tr></thead><tbody>{res.trades.map((t, i) => <tr key={i}><td>{new Date(t.entry).toISOString().slice(0, 10)}</td><td>{new Date(t.exit).toISOString().slice(0, 10)}</td><td className="num">{t.entryPrice.toFixed(2)}</td><td className="num">{t.exitPrice.toFixed(2)}</td><td className={`num ${t.ret >= 0 ? 'up' : 'down'}`}>{(t.ret * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
              </details>
              <div className="faint">Past results do not predict future ones. Long only, no leverage, no slippage beyond the fee, filled at the next bar's open.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
