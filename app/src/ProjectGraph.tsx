import { useEffect, useMemo, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import type { GNode, Graph, NKind } from '../shared/projgraph'
import type { Dependent } from '../electron/graphstore'

const COLS: { kinds: NKind[]; title: string }[] = [
  { kinds: ['service'], title: 'Services' },
  { kinds: ['module'], title: 'Modules' },
  { kinds: ['table', 'store'], title: 'Tables and stores' },
  { kinds: ['adr', 'decision'], title: 'ADRs and decisions' },
]
const W = 158
const GAP = 34
const ROW = 30
const TOP = 34
const MAX = 60

/** Phase 121: the project as a graph; pick a node to see what depends on it and which decisions touch it. */
export function ProjectGraph(props: { cwd?: string; onClose: () => void; onAsk: (text: string) => void }) {
  const [g, setG] = useState<(Graph & { built: number }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ dependents: Dependent[]; touching: GNode[] } | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => void (props.cwd && window.stm.projGraph.get(props.cwd).then(setG, (e) => setErr(clean(e)))), [props.cwd])
  useEffect(() => {
    if (!sel || !props.cwd) return setFocus(null)
    void window.stm.projGraph.focus(props.cwd, sel).then(setFocus, (e) => setErr(clean(e)))
  }, [sel, props.cwd])
  const build = () => {
    if (!props.cwd) return
    setBusy(true), setErr('')
    void window.stm.projGraph.build(props.cwd).then((r) => (setG(r), setBusy(false)), (e) => (setErr(clean(e)), setBusy(false)))
  }

  const layout = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>()
    const cols = COLS.map((c, i) => {
      const list = (g?.nodes ?? []).filter((n) => c.kinds.includes(n.kind)).sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
      const shown = list.slice(0, MAX)
      shown.forEach((n, k) => pos.set(n.id, { x: i * (W + GAP), y: TOP + k * ROW }))
      return { ...c, shown, more: list.length - shown.length }
    })
    const h = TOP + Math.max(1, ...cols.map((c) => c.shown.length)) * ROW + 10
    return { pos, cols, h, w: COLS.length * W + (COLS.length - 1) * GAP }
  }, [g])

  const lit = new Set<string>(sel ? [sel, ...(focus?.dependents.map((d) => d.id) ?? []), ...(focus?.touching.map((t) => t.id) ?? [])] : [])
  const deps = new Set(focus?.dependents.map((d) => d.id) ?? [])
  const docs = new Set(focus?.touching.map((t) => t.id) ?? [])
  const search = (e: React.FormEvent) => {
    e.preventDefault()
    const t = q.trim().toLowerCase()
    const hit = g?.nodes.find((n) => n.label.toLowerCase() === t) ?? g?.nodes.find((n) => n.label.toLowerCase().includes(t))
    if (hit) setSel(hit.id)
  }
  const node = g?.nodes.find((n) => n.id === sel)
  const short = (n: GNode) => (n.kind === 'module' ? n.label.split('/').slice(-2).join('/') : n.label)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config pg" role="dialog" aria-label="Project graph">
        <header className="sheet-head">
          <div className="sheet-title">Project graph</div>
          <span className="faint">{g?.nodes.length ? `${g.nodes.length} nodes · ${g.edges.length} links · built ${new Date(g.built).toLocaleString()}` : 'services, modules, tables, ADRs and decisions, from what the project already says'}</span>
          <span className="spacer-flex" />
          <form onSubmit={search} className="pg-find"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a node" aria-label="Find a node" spellCheck={false} /></form>
          <button className={g?.nodes.length ? '' : 'primary'} disabled={busy || !props.cwd} onClick={build}>{busy ? 'Reading…' : g?.nodes.length ? 'Rebuild' : 'Build it'}</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {err && <div className="bg-err">{err}</div>}
        {!props.cwd ? <div className="pg-empty faint">Open a panel in a project first.</div> : !g?.nodes.length ? <div className="pg-empty faint">Not built yet. Building reads imports, the backend map, SQL and ORM schemas, the ADRs in docs/adr and the decisions in this project's memory.</div> : (
          <div className="pg-body">
            <div className="pg-canvas">
              <svg width={layout.w} height={layout.h} role="img" aria-label="Project graph">
                {layout.cols.map((c, i) => <text key={c.title} className="pg-colhead" x={i * (W + GAP)} y={14}>{c.title.toUpperCase()}{c.more > 0 ? ` · +${c.more}` : ''}</text>)}
                {g.edges.map((e, i) => {
                  const a = layout.pos.get(e.from)
                  const b = layout.pos.get(e.to)
                  if (!a || !b) return null
                  const on = sel && lit.has(e.from) && lit.has(e.to) && (e.from === sel || e.to === sel || deps.has(e.from) || docs.has(e.from))
                  const [x1, x2] = a.x <= b.x ? [a.x + W, b.x] : [a.x, b.x + W]
                  const y1 = a.y + 11
                  const y2 = b.y + 11
                  const mx = (x1 + x2) / 2
                  return <path key={i} className={`pg-edge ${e.rel} ${on ? 'on' : sel ? 'dim' : ''}`} d={a.x === b.x ? `M${a.x + W} ${y1} C${a.x + W + 40} ${y1} ${a.x + W + 40} ${y2} ${a.x + W} ${y2}` : `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`} />
                })}
                {layout.cols.flatMap((c) => c.shown).map((n) => {
                  const p = layout.pos.get(n.id)!
                  const cls = n.id === sel ? 'sel' : deps.has(n.id) ? 'dep' : docs.has(n.id) ? 'doc' : sel ? 'dim' : ''
                  return (
                    <g key={n.id} className={`pg-node ${n.kind} ${cls}`} transform={`translate(${p.x} ${p.y})`} onClick={() => setSel(n.id === sel ? null : n.id)}>
                      <title>{`${n.kind} ${n.label}${n.detail ? ` · ${n.detail}` : ''}`}</title>
                      <path d={`M0 0 H${W - 8} L${W} 8 V22 H0 Z`} />
                      <text x={8} y={15}>{short(n).length > 20 ? `${short(n).slice(0, 19)}…` : short(n)}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
            <aside className="pg-side">
              {!node ? <div className="faint">Pick a node to see what depends on it and which decisions touch it. In a message, <code>@graph what depends on billing</code> asks the same.</div> : (
                <>
                  <div className="pg-kind">{node.kind}</div>
                  <div className="pg-title">{node.label}</div>
                  {node.detail && <div className="faint">{node.detail}</div>}
                  <div className="sp-label">Depends on it · {focus?.dependents.length ?? 0}</div>
                  {(focus?.dependents ?? []).slice(0, 30).map((d) => <button key={d.id} className="pg-li" onClick={() => setSel(d.id)}><span className="pg-k">{d.kind}</span><span>{short(d)}</span>{d.depth > 1 && <span className="faint">+{d.depth - 1}</span>}</button>)}
                  {focus && !focus.dependents.length && <div className="faint">Nothing in the graph.</div>}
                  <div className="sp-label">Decisions touching it · {focus?.touching.length ?? 0}</div>
                  {(focus?.touching ?? []).map((t) => <div key={t.id} className="pg-doc"><span className="pg-k">{t.kind === 'adr' ? 'ADR' : 'kept'}</span><span>{t.label}</span></div>)}
                  {focus && !focus.touching.length && <div className="faint">None names it.</div>}
                  <button className="small" onClick={() => props.onAsk(`@graph what depends on ${node.label}, and which decisions touch it?`)}>Ask Claude with this</button>
                </>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
