import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react'
import { compact, nearest, niceTicks, scale, timeTicks } from '../shared/chartmath'

// The app's own charts, drawn in SVG to the brand (docs/BRAND.md): bars with the 45-degree cut on their
// top corner, 2px lines, mono axes, a quiet grid, one axis per chart. Colours are the validated series
// tokens (--s0 to --s5) in fixed order, so they follow the theme with no redraw. A crosshair with every
// value on hover, a legend from two series up, and the table one click away: nothing is colour alone.

export type ChartSeries = { name: string; points: [number | string, number][] }
export type ChartProps = { kind: 'line' | 'bar'; series: ChartSeries[]; time?: boolean; unit?: string; label: string; height?: number }

const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(v * 1000) / 1000))
const color = (i: number) => `var(--s${i % 6})`
const CUT = 4

/** The width of the element, kept current. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** A bar as a polygon: square, its top-right corner cut at 45 degrees; downward bars cut at the bottom. */
const barPath = (x: number, y: number, w: number, h: number, down: boolean) => {
  const c = Math.min(CUT, w / 2, h)
  return down ? `M${x},${y}h${w}v${h - c}l${-c},${c}h${-(w - c)}Z` : `M${x},${y + h}v${-h}h${w - c}l${c},${c}v${h - c}Z`
}

export function Chart(p: ChartProps) {
  const [box, width] = useWidth()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const h = p.height ?? 240
  const many = p.series.length > 1
  const unit = p.unit ? ` ${p.unit}` : ''

  // x positions: categories in order of the first series, or times
  const geo = useMemo(() => {
    const cats = p.time ? [] : [...new Set(p.series.flatMap((s) => s.points.map((x) => String(x[0]))))]
    const times = p.time ? [...new Set(p.series.flatMap((s) => s.points.map((x) => Number(x[0]))))].sort((a, b) => a - b) : []
    const vals = p.series.flatMap((s) => s.points.map((x) => x[1])).filter(Number.isFinite)
    const ticks = niceTicks(Math.min(...vals, 0), Math.max(...vals, 0), Math.max(3, Math.floor(h / 48)), p.kind === 'bar')
    const lab = Math.max(...ticks.map((t) => compact(t).length)) * 6.6 + 12
    return { cats, times, ticks, left: Math.max(28, lab) }
  }, [p.series, p.time, p.kind, h])

  const W = Math.max(0, width)
  const top = 8
  const bottom = 22
  const right = 10
  const iw = Math.max(1, W - geo.left - right)
  const ih = Math.max(1, h - top - bottom)
  const y = scale(geo.ticks[0]!, geo.ticks[geo.ticks.length - 1]!, top + ih, top)
  const y0 = y(Math.max(geo.ticks[0]!, Math.min(0, geo.ticks[geo.ticks.length - 1]!)))
  const n = p.time ? geo.times.length : geo.cats.length
  const band = iw / Math.max(1, n)
  const xs = p.time
    ? geo.times.map(scale(geo.times[0] ?? 0, geo.times[geo.times.length - 1] ?? 1, geo.left, geo.left + iw))
    : geo.cats.map((_, i) => geo.left + band * (i + 0.5))
  const at = (s: ChartSeries, i: number) => {
    const key = p.time ? geo.times[i] : geo.cats[i]
    return s.points.find((x) => (p.time ? Number(x[0]) : String(x[0])) === key)?.[1]
  }
  const xLabel = (i: number) => (p.time ? new Date(geo.times[i]!).toLocaleString() : geo.cats[i]!)

  // x axis labels that fit: times at calendar steps, categories thinned out
  const xTicks = p.time
    ? (() => {
        const t = timeTicks(geo.times[0] ?? 0, geo.times[geo.times.length - 1] ?? 1, Math.max(2, Math.floor(iw / 80)))
        const sx = scale(geo.times[0] ?? 0, geo.times[geo.times.length - 1] ?? 1, geo.left, geo.left + iw)
        return t.ticks.map((v) => ({ x: sx(v), text: t.label(v) }))
      })()
    : (() => {
        const longest = Math.max(1, ...geo.cats.map((c) => Math.min(14, c.length)))
        const every = Math.max(1, Math.ceil((longest * 6.6 + 10) / band))
        return geo.cats.map((c, i) => ({ x: xs[i]!, text: c.length > 14 ? `${c.slice(0, 13)}…` : c })).filter((_, i) => i % every === 0)
      })()

  const move = (e: PE<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(n ? nearest(xs, e.clientX - r.left + geo.left) : null)
  }
  const rows = (p.time ? geo.times : geo.cats).map((k, i) => [k, ...p.series.map((s) => at(s, i))])
  const tip = hover !== null && W > 0 ? { x: xs[hover]!, items: p.series.map((s, k) => ({ name: s.name, v: at(s, hover), k })) } : null

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="ob-label">{p.label}</span>
        <button className="link" onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show table'}</button>
      </figcaption>
      {many && !table && (
        <div className="chart-legend">
          {p.series.map((s, i) => <span key={s.name}><i style={{ background: color(i) }} />{s.name}</span>)}
        </div>
      )}
      {table ? (
        <div className="ph-table" style={{ maxHeight: h }}>
          <table className="ob-table">
            <thead><tr><th>{p.time ? 'time' : ''}</th>{p.series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{xLabel(i)}</td>{r.slice(1).map((v, k) => <td key={k}>{v == null ? '' : `${fmt(v as number)}${unit}`}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="chart-box" style={{ height: h }}>
          {W > 0 && (
            <svg width={W} height={h} role="img" aria-label={`${p.label}: ${p.series.map((s) => s.name).join(', ')}`} className={`chart-svg ${p.kind}`}>
              {/* grid and y axis */}
              {geo.ticks.map((t) => (
                <g key={t}>
                  <line x1={geo.left} x2={geo.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-zero' : 'chart-grid'} />
                  <text x={geo.left - 8} y={y(t)} className="chart-tick" textAnchor="end" dominantBaseline="middle">{compact(t)}</text>
                </g>
              ))}
              {xTicks.map((t, i) => <text key={i} x={t.x} y={h - 6} className="chart-tick" textAnchor="middle">{t.text}</text>)}
              {/* the hovered column */}
              {tip && p.kind === 'bar' && <rect x={tip.x - band / 2} y={top} width={band} height={ih} className="chart-band" />}
              {tip && p.kind === 'line' && <line x1={tip.x} x2={tip.x} y1={top} y2={top + ih} className="chart-cross" />}
              {p.kind === 'bar'
                ? (() => {
                    const k = p.series.length
                    const bw = Math.max(2, Math.min(28, (band * 0.72 - 2 * (k - 1)) / k))
                    const gw = bw * k + 2 * (k - 1)
                    return p.series.map((s, si) =>
                      xs.map((cx, i) => {
                        const v = at(s, i)
                        if (v == null || !Number.isFinite(v)) return null
                        const yv = y(v)
                        const down = v < 0
                        const bh = Math.max(down ? 0 : 1, Math.abs(yv - y0))
                        return <path key={`${si}-${i}`} d={barPath(cx - gw / 2 + si * (bw + 2), down ? y0 : y0 - bh, bw, bh, down)} style={{ fill: color(si), animationDelay: `${Math.min(i, 20) * 18}ms` }} className={`chart-bar ${hover !== null && hover !== i ? 'dim' : ''}`} />
                      }),
                    )
                  })()
                : p.series.map((s, si) => {
                    const pts = xs.map((x, i) => [x, at(s, i)] as const).filter((x): x is readonly [number, number] => x[1] != null && Number.isFinite(x[1]))
                    if (!pts.length) return null
                    const d = pts.map(([x, v], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y(v).toFixed(1)}`).join('')
                    return (
                      <g key={s.name}>
                        {!many && <path d={`${d}L${pts[pts.length - 1]![0]},${y0}L${pts[0]![0]},${y0}Z`} className="chart-area" style={{ fill: color(si) }} />}
                        <path d={d} pathLength={1} className="chart-line" style={{ stroke: color(si) }} />
                        {pts.length <= 40 && pts.map(([x, v], i) => <rect key={i} x={x - 2.5} y={y(v) - 2.5} width={5} height={5} className="chart-dot" style={{ fill: color(si) }} />)}
                        {tip && at(s, hover!) != null && <rect x={tip.x - 4.5} y={y(at(s, hover!)!) - 4.5} width={9} height={9} transform={`rotate(45 ${tip.x} ${y(at(s, hover!)!)})`} className="chart-mark" style={{ fill: color(si) }} />}
                      </g>
                    )
                  })}
              <rect x={geo.left} y={top} width={iw} height={ih} fill="transparent" onPointerMove={move} onPointerLeave={() => setHover(null)} />
            </svg>
          )}
          {tip && (
            <div className={`chart-tip ${tip.x > W * 0.6 ? 'left' : ''}`} style={{ left: tip.x > W * 0.6 ? undefined : tip.x + 12, right: tip.x > W * 0.6 ? W - tip.x + 12 : undefined }}>
              <b>{xLabel(hover!)}</b>
              {tip.items.map((it) => <span key={it.name}><i style={{ background: color(it.k) }} />{many ? `${it.name} ` : ''}<em>{it.v == null ? '-' : `${fmt(it.v)}${unit}`}</em></span>)}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

/** A small line with no axes, for a trend next to a number. */
export function Sparkline(props: { values: number[]; width?: number; height?: number; index?: number; label: string }) {
  const w = props.width ?? 96
  const h = props.height ?? 24
  const v = props.values.filter(Number.isFinite)
  if (v.length < 2) return <svg width={w} height={h} role="img" aria-label={`${props.label}: not enough data`} />
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  const sx = scale(0, v.length - 1, 1, w - 4)
  const sy = scale(lo, hi === lo ? lo + 1 : hi, h - 2, 2)
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(x).toFixed(1)}`).join('')
  const last = v[v.length - 1]!
  return (
    <svg width={w} height={h} role="img" aria-label={`${props.label}: from ${fmt(v[0]!)} to ${fmt(last)}`} className="chart-spark">
      <path d={d} pathLength={1} className="chart-line" style={{ stroke: color(props.index ?? 0) }} />
      <rect x={sx(v.length - 1) - 2.5} y={sy(last) - 2.5} width={5} height={5} style={{ fill: color(props.index ?? 0) }} />
    </svg>
  )
}

/** A headline number with its label, an optional change and trend. */
export function Stat(props: { label: string; value: number; unit?: string; change?: number; trend?: number[] }) {
  return (
    <div className="chart-stat">
      <span className="chart-name">{props.label}</span>
      <b>{fmt(props.value)}{props.unit ? <small>{props.unit}</small> : null}</b>
      <span className="chart-stat-foot">
        {props.change !== undefined && <span className={props.change >= 0 ? 'up' : 'down'}>{props.change >= 0 ? '▲' : '▼'} {Math.abs(props.change).toFixed(1)}%</span>}
        {props.trend && <Sparkline values={props.trend} label={props.label} />}
      </span>
    </div>
  )
}

/** A meter: how much of a limit is used, in segments, warning from 80% and over at 100%. */
export function Meter(props: { label: string; value: number; max: number; unit?: string }) {
  const r = props.max > 0 ? props.value / props.max : 0
  const seg = 20
  const on = Math.min(seg, Math.round(r * seg))
  const state = r >= 1 ? 'over' : r >= 0.8 ? 'warn' : 'ok'
  return (
    <div className={`chart-meter ${state}`} role="meter" aria-valuenow={props.value} aria-valuemax={props.max} aria-label={props.label}>
      <span className="chart-meter-head"><span className="chart-name">{props.label}</span><em>{fmt(props.value)} / {fmt(props.max)}{props.unit ? ` ${props.unit}` : ''} · {Math.round(r * 100)}%</em></span>
      <span className="chart-meter-bar">{Array.from({ length: seg }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}</span>
    </div>
  )
}
