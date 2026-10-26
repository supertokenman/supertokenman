import { useEffect, useMemo, useState } from 'react'
import type { BackendMap, Service } from '../shared/backendmap'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconClose, IconDatabase, IconRefresh } from './icons'
import './bridge'

type Scan = Awaited<ReturnType<typeof window.stm.bmap.scan>>
const W = 180
const H = 48

/** Services on the left, data stores on the right, lines for what uses what: our own drawing. */
function Diagram(props: { map: BackendMap; pick: string | null; onPick: (name: string | null) => void }) {
  const { services, stores } = props.map
  const rows = Math.max(services.length, stores.length, 1)
  const height = rows * (H + 18) + 20
  const sx = 16
  const dx = 16 + W + 220
  const sy = (i: number) => 14 + i * (H + 18)
  const yOf = new Map(services.map((s, i) => [s.name, sy(i) + H / 2]))
  const storeY = new Map(stores.map((s, i) => [s, sy(i) + H / 2]))
  const cut = (x: number, y: number, w: number, h: number, c = 9) => `M${x},${y}h${w - c}l${c},${c}v${h - c}h${-w}Z`
  const on = (s: Service) => !props.pick || props.pick === s.name
  return (
    <svg className="bm-svg" width={dx + W + 16} height={height} role="img" aria-label={`${services.length} services and ${stores.length} data stores`}>
      <defs>
        <marker id="bm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" className="bm-arrowhead" /></marker>
      </defs>
      {services.flatMap((s) => [
        ...s.stores.map((st) => {
          const y1 = yOf.get(s.name)!
          const y2 = storeY.get(st)!
          return <path key={`${s.name}>${st}`} d={`M${sx + W},${y1} C${sx + W + 110},${y1} ${dx - 110},${y2} ${dx},${y2}`} className={`bm-edge ${on(s) ? '' : 'dim'}`} />
        }),
        ...s.uses.filter((u) => yOf.has(u)).map((u) => {
          const y1 = yOf.get(s.name)!
          const y2 = yOf.get(u)!
          return <path key={`${s.name}>${u}`} d={`M${sx},${y1} C${sx - 14},${y1} ${sx - 14},${y2} ${sx},${y2}`} className={`bm-edge uses ${on(s) ? '' : 'dim'}`} markerEnd="url(#bm-arrow)" />
        }),
      ])}
      {services.map((s, i) => (
        <g key={s.name} className={`bm-node ${props.pick === s.name ? 'on' : ''} ${on(s) ? '' : 'dim'}`} onClick={() => props.onPick(props.pick === s.name ? null : s.name)} role="button" aria-label={`${s.name}, ${s.routes.length} routes`}>
          <path d={cut(sx, sy(i), W, H)} />
          <text x={sx + 12} y={sy(i) + 20} className="bm-name">{s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name}</text>
          <text x={sx + 12} y={sy(i) + 36} className="bm-meta">{s.routes.length} routes · {s.lang === 'py' ? 'Python' : 'JS/TS'}</text>
        </g>
      ))}
      {stores.map((st, i) => (
        <g key={st} className="bm-store">
          <path d={`M${dx},${sy(i) + 8} a${W / 2},8 0 0 1 ${W},0 v${H - 16} a${W / 2},8 0 0 1 ${-W},0 Z`} />
          <path d={`M${dx},${sy(i) + 8} a${W / 2},8 0 0 0 ${W},0`} className="bm-rim" />
          <text x={dx + W / 2} y={sy(i) + H / 2 + 8} textAnchor="middle" className="bm-name">{st}</text>
        </g>
      ))}
    </svg>
  )
}

/**
 * Backend map: the project's services, the routes each serves and the data stores it talks to, read from
 * the source (Express, Hono, Fastify, Koa, NestJS, Next.js, Encore, FastAPI, Flask) without running it.
 * Saved as docs/backend-map.md with a Mermaid diagram, or sent to Claude.
 */
export function BackendMapSheet(props: { cwd?: string; onClose: () => void; onAttach: (note: { label: string; text: string }) => void }) {
  const [scan, setScan] = useState<Scan | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState('')
  const [clash, setClash] = useState('')
  const run = () => {
    if (!props.cwd) return
    setBusy(true)
    setErr('')
    void window.stm.bmap.scan(props.cwd).then(setScan, (e) => setErr(clean(e))).finally(() => setBusy(false))
  }
  useEffect(run, [props.cwd])
  const routes = useMemo(() => (scan?.map.services ?? []).filter((s) => !pick || s.name === pick).flatMap((s) => s.routes.map((r) => ({ ...r, svc: s.name }))).filter((r) => !q || `${r.method} ${r.path} ${r.file}`.toLowerCase().includes(q.toLowerCase())), [scan, pick, q])
  const total = (scan?.map.services ?? []).reduce((n, s) => n + s.routes.length, 0)
  const save = (replace: boolean) => props.cwd && scan && void window.stm.bmap.save(props.cwd, scan.markdown, replace).then((r) => (r.written ? (setClash(''), setMsg(`Saved ${r.file}.`)) : setClash(r.file)), (e) => setErr(clean(e)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe bm" role="dialog" aria-label="Backend map">
        <header className="sheet-head">
          <div className="sheet-title">Backend map</div>
          <span className="faint">{scan ? `${scan.map.services.length} services · ${total} routes · ${scan.map.stores.length} data stores · ${scan.map.scanned} files read${scan.cut ? ' (stopped at 4,000)' : ''}` : ''}</span>
          <span className="spacer-flex" />
          <button className="ghost small" disabled={busy || !props.cwd} onClick={run}><IconRefresh />Read again</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {!props.cwd ? <div className="dsg-body"><div className="faint">Focus a panel on a project first.</div></div> : busy && !scan ? <div className="dsg-body"><div className="faint"><StateMark state="busy" label="Reading" /> Reading the source…</div></div> : (
          <div className="bm-body">
            {err && <div className="notice error">{err}</div>}
            {scan && !scan.map.services.some((s) => s.routes.length) && <div className="notice">No routes found. The map reads Express, Hono, Fastify, Koa, NestJS, Next.js, Encore, FastAPI and Flask patterns; routes built at runtime are not seen.</div>}
            {scan && (
              <>
                <div className="bm-diagram"><Diagram map={scan.map} pick={pick} onPick={setPick} /></div>
                {scan.gateway && (
                  <section className="bm-gw">
                    <div className="sp-label">Gateway · Kong · {scan.gateway.file}</div>
                    <div className="faint">{scan.gateway.services} services, {scan.gateway.routes.length} routes{scan.gateway.global.length ? `; on every route: ${scan.gateway.global.join(', ')}` : ''}. Read from the file only; the running gateway is not asked.</div>
                    <table className="vb-table">
                      <thead><tr><th>Route</th><th>Methods</th><th>Paths</th><th>Upstream</th><th>Plugins</th></tr></thead>
                      <tbody>{scan.gateway.routes.map((r) => <tr key={r.route}><td><code>{r.route}</code></td><td>{r.methods.join(' ') || 'any'}</td><td><code>{r.paths.join(', ') || '/'}</code></td><td className="faint">{r.upstream}</td><td>{r.plugins.map((p) => <span key={p} className="pt-kind bm-plugin">{p}</span>)}</td></tr>)}</tbody>
                    </table>
                    {scan.gateway.findings.map((f, i) => <div key={i} className={`bm-find ${f.level}`}><span className="pt-kind">{f.level === 'warn' ? 'Check' : 'Note'}</span>{f.text}</div>)}
                  </section>
                )}
                <div className="bm-legend faint"><span><i className="solid" />talks to a data store</span><span><i className="dash" />depends on another service (package dependency)</span><span>Click a service to see only its routes.</span></div>
                <div className="ob-row">
                  <input className="ob-grow" placeholder={pick ? `Filter ${pick}'s routes` : 'Filter routes by method, path or file'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter routes" />
                  {pick && <button className="ghost small" onClick={() => setPick(null)}>All services</button>}
                  <button className="small" onClick={() => props.onAttach({ label: `Backend map · ${total} routes`, text: scan.markdown.slice(0, 40_000) })}>Send to Claude</button>
                  {clash ? <button className="danger small" onClick={() => save(true)}>Replace docs/backend-map.md</button> : <button className="primary small" onClick={() => save(false)}><IconDatabase />Save as docs/backend-map.md</button>}
                </div>
                {clash && <div className="notice">{clash} already exists. Replace it, or close this.</div>}
                {msg && <div className="notice">{msg}</div>}
                <div className="dbv-grid bm-routes">
                  <table>
                    <thead><tr><th>Method</th><th>Path</th><th>Service</th><th>Where</th><th>From</th></tr></thead>
                    <tbody>
                      {routes.map((r, i) => (
                        <tr key={i}>
                          <td><span className={`bm-method ${r.method.toLowerCase()}`}>{r.method}</span></td>
                          <td>{r.path}</td>
                          <td className="faint">{r.svc}</td>
                          <td className="faint">{r.file}:{r.line}</td>
                          <td className="faint">{r.framework}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
