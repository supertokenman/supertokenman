import { useEffect, useMemo, useRef, useState } from 'react'
import { IconClose } from './icons'
import type { GraphEdge, GraphNode } from '../electron/memory'
import { layout, neighbors, type Placed } from './vaultLayout'
import { Markdown } from './markdown'

const COLOR = { project: 'var(--accent)', rule: 'var(--text)', session: 'var(--muted)' } as const

/** A drawn map of the vault: drag to pan, wheel to zoom, hover to light up links, click to read. */
export function VaultMap(props: { nodes: GraphNode[]; edges: GraphEdge[]; project: string; onUse: (file: string) => void }) {
  const placed = useMemo(() => layout(props.nodes, props.project), [props.nodes, props.project])
  const at = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed])
  const [hover, setHover] = useState<string | null>(null)
  const [picked, setPicked] = useState<Placed | null>(null)
  const [note, setNote] = useState('')
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  // fit everything on first draw
  const bounds = useMemo(() => {
    const xs = placed.map((n) => n.x)
    const ys = placed.map((n) => n.y)
    const pad = 70
    return xs.length ? { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 } : { x: -300, y: -200, w: 600, h: 400 }
  }, [placed])

  useEffect(() => {
    if (!picked) return setNote('')
    void window.stm.memoryRead(picked.id).then((t) => setNote(t.replace(/^---\n[\s\S]*?\n---\n/, '').trim()))
  }, [picked])

  const lit = hover ? neighbors(props.edges, hover) : picked ? neighbors(props.edges, picked.id) : null
  const vb = `${bounds.x + view.x} ${bounds.y + view.y} ${bounds.w / view.k} ${bounds.h / view.k}`

  return (
    <div className={`vmap ${picked ? 'with-note' : ''}`}>
      <svg
        ref={svg}
        className="vmap-canvas"
        viewBox={vb}
        onWheel={(e) => {
          const k = Math.max(0.5, Math.min(4, view.k * (e.deltaY > 0 ? 0.9 : 1.1)))
          setView({ ...view, k })
        }}
        onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y })}
        onMouseMove={(e) => {
          if (!drag.current || !svg.current) return
          const scale = bounds.w / view.k / svg.current.clientWidth
          setView({ ...view, x: drag.current.vx - (e.clientX - drag.current.x) * scale, y: drag.current.vy - (e.clientY - drag.current.y) * scale })
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
      >
        <defs>
          <radialGradient id="vglow">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* the orbits: guides for the eye, not data */}
        {[110, 170, 240].map((r) => (
          <ellipse key={r} cx="0" cy="0" rx={r} ry={r * 0.82} fill="none" stroke="rgba(var(--overlay-rgb),0.06)" strokeDasharray="2 6" />
        ))}
        <circle cx="0" cy="0" r="120" fill="url(#vglow)" />

        {props.edges.map((e, i) => {
          const a = at.get(e.a)
          const b = at.get(e.b)
          if (!a || !b) return null
          const on = lit ? lit.has(e.a) && lit.has(e.b) : false
          // bend each link toward the center, so they read as arcs, not a hairball
          const mx = (a.x + b.x) / 2 * 0.82
          const my = (a.y + b.y) / 2 * 0.82
          const stroke = e.why === 'files' ? 'var(--accent)' : e.why === 'link' ? 'var(--text)' : 'var(--faint)'
          return (
            <path
              key={i}
              d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`}
              fill="none"
              stroke={stroke}
              strokeWidth={e.why === 'files' ? Math.min(3, 0.6 + e.weight * 0.5) : 0.8}
              strokeOpacity={lit ? (on ? 0.85 : 0.04) : e.why === 'project' ? 0.18 : 0.32}
              strokeDasharray={e.why === 'link' ? '3 3' : undefined}
              style={{ transition: 'stroke-opacity 160ms' }}
            />
          )
        })}

        {placed.map((n) => {
          const dim = lit && !lit.has(n.id)
          const active = hover === n.id || picked?.id === n.id
          return (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              style={{ cursor: 'pointer', opacity: dim ? 0.16 : 1, transition: 'opacity 160ms' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                e.stopPropagation()
                setPicked(picked?.id === n.id ? null : n)
              }}
            >
              {active && <circle r={n.r + 6} fill="none" stroke="var(--accent)" strokeOpacity="0.6" />}
              {n.kind === 'rule' ? (
                <rect x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} transform="rotate(45)" fill="var(--bg)" stroke={COLOR.rule} strokeWidth="1.4" />
              ) : n.kind === 'project' ? (
                <>
                  <circle r={n.r} fill="var(--raised)" stroke={COLOR.project} strokeWidth="2" />
                  <circle r={n.r * 0.45} fill={COLOR.project} />
                </>
              ) : (
                <circle r={n.r} fill={n.project === props.project ? 'var(--accent)' : COLOR.session} fillOpacity={n.project === props.project ? 0.85 : 0.5} stroke="var(--bg)" strokeWidth="1.5" />
              )}
              {(n.label || active) && (
                <text
                  y={n.kind === 'session' ? -n.r - 6 : n.r + 15}
                  textAnchor="middle"
                  fontSize={n.kind === 'project' ? 12 : 10}
                  fontWeight={n.kind === 'project' ? 700 : 500}
                  fill={n.kind === 'session' ? 'var(--muted)' : 'var(--text)'}
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 4 }}
                >
                  {n.title.length > 34 ? `${n.title.slice(0, 33)}…` : n.title}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="vmap-legend">
        <span><i className="lg project" />project</span>
        <span><i className="lg rule" />rule</span>
        <span><i className="lg session" />session, sized by cost</span>
        <span><i className="lg files" />changed the same files</span>
        <span><i className="lg link" />linked note</span>
      </div>

      {picked && (
        <aside className="vmap-note">
          <div className="vmap-note-head">
            <span className={`src ${picked.kind === 'session' ? 'skill' : 'plugin'}`}>{picked.kind}</span>
            <span className="faint">{picked.date}</span>
            {picked.usd > 0 && <span className="faint">US${picked.usd.toFixed(2)}</span>}
            <button className="icon" aria-label="Close note" onClick={() => setPicked(null)}>
              <IconClose />
            </button>
          </div>
          <div className="vmap-note-body">
            <Markdown text={note || '...'} />
          </div>
          <div className="vmap-note-foot">
            <button className="primary small" onClick={() => props.onUse(picked.id)}>Use as context</button>
          </div>
        </aside>
      )}
    </div>
  )
}
