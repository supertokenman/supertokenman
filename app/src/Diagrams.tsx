import { useEffect, useMemo, useState } from 'react'
import { TEMPLATES } from '../shared/archtemplates'
import { IconClose } from './icons'
import type { DiagramVersion } from '../electron/diagrams'
import { cells, diffCells, plain, styleMap, type Cell, type Geo } from '../shared/drawio'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)

/** Where each shape sits on the page: a child's geometry is relative to its parent. */
function placed(list: Cell[]): Map<string, Geo> {
  const byId = new Map(list.map((c) => [c.id, c]))
  const out = new Map<string, Geo>()
  const at = (c: Cell, depth = 0): Geo | undefined => {
    if (out.has(c.id)) return out.get(c.id)
    if (!c.geo || depth > 10) return undefined
    const p = byId.get(c.parent)
    const base = p && p.vertex ? at(p, depth + 1) : undefined
    const g = { x: c.geo.x + (base?.x ?? 0), y: c.geo.y + (base?.y ?? 0), w: c.geo.w || base?.w || 0, h: c.geo.h }
    out.set(c.id, g)
    return g
  }
  list.filter((c) => c.vertex).forEach((c) => at(c))
  return out
}

/** The draw.io page drawn as SVG: shapes, labels and arrows; click to select, Shift to add. */
export function DiagramView(props: { model: string; selected: string[]; onSelect: (ids: string[]) => void }) {
  const list = useMemo(() => cells(props.model), [props.model])
  const geo = useMemo(() => placed(list), [list])
  const vs = list.filter((c) => c.vertex && geo.has(c.id))
  if (!vs.length) return <div className="faint dg-empty">An empty page.</div>
  const minX = Math.min(...vs.map((c) => geo.get(c.id)!.x)) - 20
  const minY = Math.min(...vs.map((c) => geo.get(c.id)!.y)) - 20
  const maxX = Math.max(...vs.map((c) => geo.get(c.id)!.x + geo.get(c.id)!.w)) + 20
  const maxY = Math.max(...vs.map((c) => geo.get(c.id)!.y + geo.get(c.id)!.h)) + 20
  const sel = new Set(props.selected)
  const pick = (id: string, add: boolean) => props.onSelect(add ? (sel.has(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]) : sel.has(id) && props.selected.length === 1 ? [] : [id])
  // a click on a table row selects its table
  const top = (c: Cell): string => {
    const p = list.find((x) => x.id === c.parent)
    return p && p.vertex ? top(p) : c.id
  }
  const center = (id: string) => {
    const g = geo.get(id)
    return g ? { x: g.x + g.w / 2, y: g.y + g.h / 2, g } : null
  }
  return (
    <svg className="dg-svg" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="Diagram" onClick={(e) => e.target === e.currentTarget && props.onSelect([])}>
      <defs>
        <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="dg-head" /></marker>
      </defs>
      {list.filter((c) => c.edge).map((c) => {
        const a = c.source ? center(c.source) : null
        const b = c.target ? center(c.target) : null
        if (!a || !b) return null
        // leave each box from its side facing the other, then one elbow
        const horiz = Math.abs(b.x - a.x) > Math.abs(b.y - a.y)
        const p1 = horiz ? { x: a.x + Math.sign(b.x - a.x) * a.g.w / 2, y: a.y } : { x: a.x, y: a.y + Math.sign(b.y - a.y) * a.g.h / 2 }
        const p2 = horiz ? { x: b.x - Math.sign(b.x - a.x) * b.g.w / 2, y: b.y } : { x: b.x, y: b.y - Math.sign(b.y - a.y) * b.g.h / 2 }
        const mid = horiz ? `L ${(p1.x + p2.x) / 2} ${p1.y} L ${(p1.x + p2.x) / 2} ${p2.y}` : `L ${p1.x} ${(p1.y + p2.y) / 2} L ${p2.x} ${(p1.y + p2.y) / 2}`
        const label = plain(c.value)
        return (
          <g key={c.id} className={`dg-edge ${sel.has(c.id) ? 'sel' : ''}`} onClick={(e) => (e.stopPropagation(), pick(c.id, e.shiftKey))}>
            <path d={`M ${p1.x} ${p1.y} ${mid} L ${p2.x} ${p2.y}`} markerEnd="url(#dg-arrow)" />
            <path className="dg-hit" d={`M ${p1.x} ${p1.y} ${mid} L ${p2.x} ${p2.y}`} />
            {label && <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6} textAnchor="middle" className="dg-elabel">{label}</text>}
          </g>
        )
      })}
      {vs.map((c) => {
        const g = geo.get(c.id)!
        const st = styleMap(c.style)
        const shape = st.shape ?? (st.ellipse ? 'ellipse' : st.rhombus ? 'rhombus' : st.text ? 'text' : 'rect')
        const id = top(c)
        const fill = st.fillColor && st.fillColor !== 'none' ? st.fillColor : undefined
        const stroke = st.strokeColor && st.strokeColor !== 'none' ? st.strokeColor : undefined
        const label = plain(c.value)
        // a two-line label (a role tag over the name, as the templates write it) keeps its two lines
        const lines = c.value.split(/<br\s*\/?>|&lt;br\s*\/?&gt;/i).map(plain).filter(Boolean)
        const isRow = shape === 'text' || (c.parent !== '1' && !st.shape)
        return (
          <g key={c.id} className={`dg-node ${sel.has(id) && id === c.id ? 'sel' : ''} ${isRow ? 'row' : ''}`} onClick={(e) => (e.stopPropagation(), pick(id, e.shiftKey))}>
            {shape === 'ellipse' ? <ellipse cx={g.x + g.w / 2} cy={g.y + g.h / 2} rx={g.w / 2} ry={g.h / 2} style={{ fill, stroke }} />
              : shape === 'rhombus' ? <path d={`M ${g.x + g.w / 2} ${g.y} L ${g.x + g.w} ${g.y + g.h / 2} L ${g.x + g.w / 2} ${g.y + g.h} L ${g.x} ${g.y + g.h / 2} Z`} style={{ fill, stroke }} />
              : shape.startsWith('cylinder') ? <path d={`M ${g.x} ${g.y + 10} A ${g.w / 2} 10 0 0 1 ${g.x + g.w} ${g.y + 10} V ${g.y + g.h - 10} A ${g.w / 2} 10 0 0 1 ${g.x} ${g.y + g.h - 10} Z M ${g.x} ${g.y + 10} A ${g.w / 2} 10 0 0 0 ${g.x + g.w} ${g.y + 10}`} style={{ fill, stroke }} />
              : shape === 'card' ? <path d={`M ${g.x + Number(st.size ?? 12)} ${g.y} H ${g.x + g.w} V ${g.y + g.h} H ${g.x} V ${g.y + Number(st.size ?? 12)} Z`} style={{ fill, stroke, strokeDasharray: st.dashed === '1' ? '4 3' : undefined }} />
              : isRow ? <rect x={g.x} y={g.y} width={g.w} height={g.h} className="dg-rowbox" />
              : <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={st.rounded === '1' ? 8 : 0} style={{ fill, stroke }} />}
            {shape === 'table' && <line x1={g.x} x2={g.x + g.w} y1={g.y + Number(st.startSize ?? 28)} y2={g.y + Number(st.startSize ?? 28)} className="dg-rule" />}
            {lines.length === 2 && !isRow && shape !== 'table' ? (
              <text x={g.x + g.w / 2} y={g.y + g.h / 2 - 3} textAnchor="middle" className="dg-label">
                <tspan className="dg-tag">{lines[0]}</tspan>
                <tspan x={g.x + g.w / 2} dy="15">{lines[1]!.length > 40 ? `${lines[1]!.slice(0, 39)}…` : lines[1]}</tspan>
              </text>
            ) : label && (
              <text x={isRow || st.align === 'left' ? g.x + 8 : g.x + g.w / 2} y={shape === 'table' ? g.y + Number(st.startSize ?? 28) / 2 + 4 : g.y + g.h / 2 + 4} textAnchor={isRow || st.align === 'left' ? 'start' : 'middle'} className={`dg-label ${st.fontStyle === '1' ? 'b' : ''}`}>
                {label.length > 40 ? `${label.slice(0, 39)}…` : label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** One line for a version: what the change after it did, cell by cell. */
function summary(before: string, after: string): string {
  const d = diffCells(before, after)
  const shapes = (l: Cell[]) => l.filter((c) => c.vertex).length
  const parts = [
    shapes(d.added) ? `+${shapes(d.added)} shape${shapes(d.added) === 1 ? '' : 's'}` : '',
    shapes(d.removed) ? `−${shapes(d.removed)} shape${shapes(d.removed) === 1 ? '' : 's'}` : '',
    d.changed.length ? `${d.changed.length} changed (${[...new Set(d.changed.flatMap((c) => c.what))].join(', ')})` : '',
    d.added.length - shapes(d.added) || d.removed.length - shapes(d.removed) ? 'arrows changed' : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'no visible change'
}

/**
 * Diagrams: draw.io files in the project. Describe one to draw it, select shapes and describe a change
 * (only those shapes go to Claude), or redraw an image; every change keeps the version before it.
 */
export function DiagramsSheet(props: { cwd?: string; onClose: () => void; open?: string }) {
  const cwd = props.cwd ?? ''
  const [files, setFiles] = useState<{ path: string; name: string }[]>([])
  const [path, setPath] = useState<string | null>(props.open ?? null)
  const [model, setModel] = useState('')
  const [versions, setVersions] = useState<DiagramVersion[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [ask, setAsk] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [peek, setPeek] = useState<DiagramVersion | null>(null)
  const list = () => void window.stm.diagram.list(cwd).then(setFiles)
  const load = (p: string) =>
    void window.stm.diagram.open(p).then((d) => (setModel(d.model), setVersions(d.versions), setPeek(null)), (e) => setErr(clean(e)))
  // a diagram asked for from elsewhere (the Database screen's ER) is shown, even when the sheet is open
  useEffect(() => void (props.open && (setPath(props.open), setSel([]), window.stm.diagram.list(cwd).then(setFiles))), [props.open])
  // opening the sheet shows the newest diagram, when there is one and none was asked for
  useEffect(() => void window.stm.diagram.list(cwd).then((f) => (setFiles(f), !props.open && f[0] && setPath(f[0].path))), [cwd])
  useEffect(() => void (path ? load(path) : (setModel(''), setVersions([]))), [path])
  const run = async (label: string, f: () => Promise<string | null | void>) => {
    setBusy(label)
    setErr('')
    try {
      const p = await f()
      if (typeof p === 'string') (setPath(p), load(p))
      else if (path) load(path)
      list()
    } catch (e) {
      setErr(clean(e))
    }
    setBusy('')
  }
  const shapes = useMemo(() => cells(model).filter((c) => c.vertex && c.parent === '1').length, [model])
  const selLabels = useMemo(() => cells(model).filter((c) => sel.includes(c.id)).map((c) => plain(c.value) || c.id), [model, sel])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet diagrams" role="dialog" aria-label="Diagrams">
        <header className="sheet-head">
          <div className="sheet-title">Diagrams</div>
          <span className="faint">draw.io files in {cwd ? `${cwd.split('/').pop()}/diagrams` : 'a project'}</span>
          <span className="spacer-flex" />
          {path && <button className="ghost small" onClick={() => void window.stm.diagram.external(path)}>Open in draw.io</button>}
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {err && <div className="notice error dg-notice">{err}</div>}
        <div className="dg-body">
          <aside className="dg-side">
            <div className="sp-label">Files</div>
            {files.length === 0 && <div className="faint">None yet.</div>}
            {files.map((f) => <button key={f.path} className={`ib-filter ${f.path === path ? 'on' : ''}`} onClick={() => (setPath(f.path), setSel([]))}>{f.name}</button>)}
            <button className={`ib-filter ${!path ? 'on' : ''}`} onClick={() => (setPath(null), setSel([]))}>+ New diagram</button>
          </aside>
          <main className="dg-main">
            {!path ? (
              <div className="dg-new">
                <input id="dg-name" value={name} placeholder="Name, e.g. checkout architecture" onChange={(e) => setName(e.target.value)} />
                <textarea id="dg-ask" value={ask} rows={5} placeholder="Describe the diagram: the boxes, what talks to what, the flow. e.g. Browser calls the API; the API reads Postgres and caches in Redis; a worker sends e-mails from a queue." onChange={(e) => setAsk(e.target.value)} />
                <div className="sbx-actions">
                  <button className="ghost small" disabled={!!busy || !cwd} onClick={() => void run('Redrawing the image', () => window.stm.diagram.fromImage(cwd, name, ask))}>From an image or sketch…</button>
                  <button className="primary small" disabled={!!busy || !cwd || ask.trim().length < 5} onClick={() => void run('Drawing', () => window.stm.diagram.create(cwd, name, ask).then((p) => (setAsk(''), setName(''), p)))}>{busy ? <><StateMark state="busy" label="Working" /> {busy}…</> : 'Draw it'}</button>
                </div>
                <div className="sp-label">Or start from a template</div>
                <div className="dg-templates">
                  {TEMPLATES.map((t, i) => (
                    <button key={t.id} style={{ '--i': i } as React.CSSProperties} className="dg-tpl enter-diag" disabled={!!busy || !cwd} title={t.what} onClick={() => void run('Creating', () => window.stm.diagram.template(cwd, name, t.id).then((p) => (setName(''), p)))}>
                      <b>{t.name}</b><span className="faint">{t.what}</span>
                    </button>
                  ))}
                </div>
                <div className="faint">Claude writes draw.io XML; you get a .drawio file you can open and edit in draw.io, not a picture. One call on your plan, checked by the budget brake.</div>
              </div>
            ) : (
              <>
                <div className="dg-canvas">{model && <DiagramView model={peek?.model ?? model} selected={peek ? [] : sel} onSelect={peek ? () => undefined : setSel} />}</div>
                {peek && <div className="dg-peek"><span>Showing the version of {new Date(peek.at).toLocaleString()}</span><span className="spacer-flex" /><button className="ghost small" onClick={() => setPeek(null)}>Back to now</button><button className="primary small" onClick={() => void run('Restoring', () => window.stm.diagram.restore(path, peek.at))}>Restore it</button></div>}
                {!peek && (
                  <div className="dg-ask">
                    <div className="dg-scope">{sel.length ? <>Only <b>{selLabels.join(', ')}</b> go to Claude <button className="ghost small" onClick={() => setSel([])}>Clear</button></> : <span className="faint">The whole diagram ({shapes} shapes) goes to Claude. Click shapes to change only those; Shift adds.</span>}</div>
                    <div className="dep-row">
                      <input id="dg-change" value={ask} placeholder={sel.length ? 'e.g. split this into two services' : 'e.g. add a queue between the API and the worker'} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask.trim() && !busy && void run('Changing', () => window.stm.diagram.edit(path, ask, sel).then((p) => (setAsk(''), setSel([]), p)))} />
                      <button className="primary small" disabled={!!busy || !ask.trim()} onClick={() => void run('Changing', () => window.stm.diagram.edit(path, ask, sel).then((p) => (setAsk(''), setSel([]), p)))}>{busy ? <><StateMark state="busy" label="Working" /> {busy}…</> : 'Change'}</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
          {path && (
            <aside className="dg-versions">
              <div className="sp-label">Versions · each change keeps the one before</div>
              <div className="dg-ver now"><b>Now</b></div>
              {versions.map((v, i) => (
                <button key={v.at} className={`dg-ver ${peek?.at === v.at ? 'on' : ''}`} onClick={() => setPeek(peek?.at === v.at ? null : v)}>
                  <span className="dg-ver-top"><b>{new Date(v.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b><span className="faint">{v.note}</span></span>
                  <span className="faint dg-ver-diff">then: {summary(v.model, i === 0 ? model : versions[i - 1]!.model)}</span>
                </button>
              ))}
              {versions.length === 0 && <div className="faint">No changes yet.</div>}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
