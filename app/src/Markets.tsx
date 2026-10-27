import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { friendly } from './errors'
import { DEFAULT_WATCH, normalize, type Prediction, type Quote } from '../electron/markets'

const KEY = 'stm.watch'
const loadWatch = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') ?? DEFAULT_WATCH
  } catch {
    return DEFAULT_WATCH
  }
}
const money = (q: Quote) =>
  q.label.includes('/') ? q.price.toFixed(q.price < 1 ? 4 : 3).replace('.', ',') : new Intl.NumberFormat(undefined, { style: q.symbol.startsWith('^') ? 'decimal' : 'currency', currency: q.currency || 'BRL', maximumFractionDigits: q.price >= 1000 ? 0 : 2 }).format(q.price)

/** A day's line: rising green, falling red, the open as a dotted baseline. */
export function Spark({ q, w = 120, h = 34 }: { q: Quote; w?: number; h?: number }) {
  const pts = q.points.length > 1 ? q.points : [q.price - q.change, q.price]
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const y = (v: number) => (hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4))
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  const up = q.change >= 0
  return (
    <svg className={`spark ${up ? 'up' : 'down'}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1="0" x2={w} y1={y(pts[0]!)} y2={y(pts[0]!)} className="base" />
      <path d={`${d}L${w} ${h}L0 ${h}Z`} className="area" />
      <path d={d} className="line" />
    </svg>
  )
}

/** The watchlist, refreshed every minute while open. */
export function useQuotes(active: boolean) {
  const [watch, setWatch] = useState(loadWatch)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [errors, setErrors] = useState<{ symbol: string; error: string }[]>([])
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (!active) return
    const pull = () =>
      window.stm.quotes(watch).then((r) => {
        setQuotes(r.quotes)
        setErrors(r.errors)
        setAt(Date.now())
      }, () => undefined)
    void pull()
    const t = setInterval(pull, 60_000)
    return () => clearInterval(t)
  }, [active, watch])
  const save = (w: string[]) => {
    setWatch(w)
    try {
      localStorage.setItem(KEY, JSON.stringify(w))
    } catch {
      // storage off: the list lasts this session
    }
  }
  return { watch, save, quotes, errors, at }
}

/** Polymarket's busiest questions with their odds as bars; read-only. */
function Predictions() {
  const [list, setList] = useState<Prediction[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      window.stm.predictions(q).then((l) => { setList(l); setErr('') }, (e: Error) => setErr(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    }, q ? 400 : 0)
    return () => clearTimeout(t)
  }, [q])
  const vol = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`)
  return (
    <section className="pm">
      <div className="pm-head">
        <span className="group">Predictions</span>
        <span className="faint">Polymarket, by volume today</span>
        <input className="mk-add" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: election, fed, bitcoin" spellCheck={false} />
      </div>
      {err && <div className="notice error">{friendly(err)}</div>}
      <div className="pm-grid">
        {!list && !err && Array.from({ length: 6 }, (_, i) => <div key={i} className="pm-card skeleton" />)}
        {list?.map((m) => {
          const top = [...m.outcomes].sort((a, b) => b.p - a.p).slice(0, 3)
          return (
            <button key={m.id} className="pm-card" onClick={() => void window.stm.openUrl(m.url)} title={m.question}>
              <span className="pm-q" title={m.question}>{m.question}</span>
              {top.map((o, i) => (
                <span key={o.name} className="pm-row">
                  <span className="pm-name">{o.name}</span>
                  <span className="pm-bar"><span className={`pm-fill o${i}`} style={{ width: `${Math.round(o.p * 100)}%` }} /></span>
                  <b>{Math.round(o.p * 100)}%</b>
                </span>
              ))}
              <span className="pm-meta faint">{vol(m.volume24h)} today{m.ends ? ` · ends ${new Date(m.ends).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}</span>
            </button>
          )
        })}
        {list && !list.length && <div className="note">No open market matches.</div>}
      </div>
    </section>
  )
}

export function MarketsSheet({ onClose }: { onClose: () => void }) {
  const m = useQuotes(true)
  const [add, setAdd] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const byLabel = new Map(m.quotes.map((q) => [q.label, q]))
  const ordered = m.watch.map((w) => byLabel.get(normalize(w).label))
  const best = [...m.quotes].sort((a, b) => b.changePct - a.changePct)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet markets" role="dialog" aria-label="Markets">
        <header className="sheet-head">
          <div className="sheet-title">Markets</div>
          {m.at > 0 && <span className="faint">updated {new Date(m.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>}
          <span className="spacer-flex" />
          <form onSubmit={(e) => { e.preventDefault(); if (add.trim()) { m.save([...m.watch, add.trim().toUpperCase()]); setAdd('') } }}>
            <input className="mk-add" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add: WEGE3, AAPL, SOL" spellCheck={false} />
          </form>
          <button className="icon" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body mk">
          {best.length > 1 && (
            <div className="mk-heat" aria-label="Today, best to worst">
              {best.map((q) => (
                <span key={q.label} style={{ flexGrow: 1, background: `rgba(var(--${q.changePct >= 0 ? 'green' : 'red'}-rgb), ${Math.min(0.85, 0.15 + Math.abs(q.changePct) / 4)})` }} title={`${q.label} ${q.changePct.toFixed(2)}%`}>
                  {q.label}
                  <b>{q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(1)}%</b>
                </span>
              ))}
            </div>
          )}
          <div className="mk-grid">
            {m.watch.map((w, i) => {
              const q = ordered[i]
              return (
                <div key={w} className={`mk-card ${q ? (q.change >= 0 ? 'up' : 'down') : 'none'}`}>
                  <div className="mk-top">
                    <b>{q?.label ?? w}</b>
                    {q && <span className="mk-pct">{q.changePct >= 0 ? '▲' : '▼'} {Math.abs(q.changePct).toFixed(2)}%</span>}
                    <button className="nw-x" title="Remove" onClick={() => m.save(m.watch.filter((x) => x !== w))}>×</button>
                  </div>
                  {q ? (
                    <>
                      <div className="mk-price">{money(q)}</div>
                      <Spark q={q} w={180} h={40} />
                    </>
                  ) : (
                    <div className="faint mk-miss">{m.errors.find((e) => e.symbol === w)?.error ?? 'Loading...'}</div>
                  )}
                </div>
              )
            })}
          </div>
          <Predictions />
          <p className="faint mk-fine">Free public data (Yahoo Finance, brapi, CoinGecko, Polymarket). Quotes can lag up to 15 minutes. Odds are what traders pay, not facts. Not investment advice.</p>
        </div>
      </div>
    </div>
  )
}
