import { useMemo, useRef, useState } from 'react'
import type { DbSchema, PlanNode } from '../electron/db'
import { erLayout, suggest, type Suggestion } from '../shared/sqlcomplete'

/**
 * The SQL box with autocomplete from the database's schema: tables after FROM or JOIN, an alias's
 * columns after "alias.", the named tables' columns as you type. Tab or Enter takes a suggestion,
 * Cmd+Enter runs the query.
 */
export function SqlEditor(props: { value: string; onChange: (v: string) => void; onRun: () => void; schema: DbSchema | null; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [cursor, setCursor] = useState(0)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(0)
  const s = useMemo(() => (props.schema && open ? suggest(props.value, cursor, props.schema) : { start: 0, items: [] as Suggestion[] }), [props.schema, props.value, cursor, open])
  const take = (x: Suggestion) => {
    const next = props.value.slice(0, s.start) + x.text + props.value.slice(cursor)
    props.onChange(next)
    const at = s.start + x.text.length
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(at, at)
      setCursor(at)
    })
    setOpen(false)
  }
  const shown = s.items.length > 0
  return (
    <div className="sqled">
      <textarea
        ref={ref}
        id="db-sql"
        value={props.value}
        spellCheck={false}
        placeholder={props.placeholder}
        onChange={(e) => {
          props.onChange(e.target.value)
          setCursor(e.target.selectionStart)
          setOpen(true)
          setPick(0)
        }}
        onClick={(e) => (setCursor((e.target as HTMLTextAreaElement).selectionStart), setOpen(false))}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            setOpen(false)
            props.onRun()
          } else if (shown && (e.key === 'Tab' || e.key === 'Enter')) {
            e.preventDefault()
            take(s.items[pick]!)
          } else if (shown && e.key === 'ArrowDown') {
            e.preventDefault()
            setPick((pick + 1) % s.items.length)
          } else if (shown && e.key === 'ArrowUp') {
            e.preventDefault()
            setPick((pick - 1 + s.items.length) % s.items.length)
          } else if (e.key === 'Escape' && shown) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {shown && (
        <div className="sqled-menu" role="listbox" aria-label="Suggestions">
          {s.items.map((x, i) => (
            <button key={`${x.kind}${x.text}`} role="option" aria-selected={i === pick} className={i === pick ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), take(x))}>
              <span className={`sqled-k ${x.kind}`}>{x.kind === 'table' ? 'T' : x.kind === 'column' ? 'C' : 'K'}</span>
              <code>{x.text}</code>
              {x.detail && <span className="faint">{x.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The plan as a tree: each step with its rows and cost, the ones that read a whole table marked. */
export function PlanView(props: { plan: PlanNode[] }) {
  const Node = ({ n, depth }: { n: PlanNode; depth: number }) => (
    <>
      <div className={`plan-row ${n.warn ? 'warn' : ''}`} style={{ paddingLeft: 10 + depth * 18 }}>
        <span className="plan-label">{n.label}</span>
        {n.detail && <span className="faint plan-detail">{n.detail}</span>}
        <span className="spacer-flex" />
        {n.rows !== undefined && n.rows > 0 && <span className="plan-num">{n.rows.toLocaleString('en-US')} rows</span>}
        {n.cost !== undefined && n.cost > 0 && <span className="plan-num">cost {Math.round(n.cost).toLocaleString('en-US')}</span>}
        {n.warn && <span className="plan-warn">{n.warn}</span>}
      </div>
      {n.children.map((c, i) => <Node key={i} n={c} depth={depth + 1} />)}
    </>
  )
  return <div className="plan">{props.plan.map((n, i) => <Node key={i} n={n} depth={0} />)}</div>
}

/** The tables and their foreign keys, drawn to scale; a line runs from the key's column to the table it points at. */
export function ErDiagram(props: { schema: DbSchema; onPick: (table: string) => void }) {
  const tables = props.schema.tables.slice(0, 60)
  const l = useMemo(() => erLayout(tables), [tables])
  const box = (name: string) => l.boxes.find((b) => b.name === name)
  const ROW = 18
  return (
    <div className="er-wrap">
      <svg className="er" width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`} role="img" aria-label="Tables and their foreign keys">
        {props.schema.fks.map((f, i) => {
          const a = box(f.from)
          const b = box(f.to)
          const t = tables.find((x) => x.name === f.from)
          if (!a || !b || !t) return null
          const ci = Math.min(t.columns.findIndex((c) => c.name === f.column), 11)
          const y1 = a.y + 28 + Math.max(0, ci) * ROW + ROW / 2
          const y2 = b.y + 14
          const right = b.x > a.x + a.w / 2
          const x1 = right ? a.x + a.w : a.x
          const x2 = right ? b.x : b.x + b.w
          const dx = Math.max(30, Math.abs(x2 - x1) / 2) * (right ? 1 : -1)
          const self = f.from === f.to
          const d = self ? `M ${a.x + a.w} ${y1} c 30 0 30 ${y2 - y1} 0 ${y2 - y1}` : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
          return (
            <g key={i} className="er-link">
              <path d={d} />
              <circle cx={self ? a.x + a.w : x2} cy={y2} r="3" />
            </g>
          )
        })}
        {l.boxes.map((b) => {
          const t = tables.find((x) => x.name === b.name)!
          return (
            <g key={b.name} className="er-box" transform={`translate(${b.x} ${b.y})`} onClick={() => props.onPick(b.name)}>
              <path className="er-frame" d={`M0 0 H${b.w - 10} L${b.w} 10 V${b.h} H0 Z`} />
              <text className="er-name" x="10" y="19">{b.name}</text>
              <line className="er-rule" x1="0" x2={b.w} y1="28" y2="28" />
              {t.columns.slice(0, 12).map((c, i) => (
                <g key={c.name} transform={`translate(0 ${28 + i * ROW})`}>
                  <text className={`er-col ${c.pk ? 'pk' : ''}`} x="10" y="13">{c.pk ? '# ' : ''}{c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name}</text>
                  <text className="er-type" x={b.w - 8} y="13" textAnchor="end">{c.type.length > 10 ? `${c.type.slice(0, 9)}…` : c.type}</text>
                </g>
              ))}
              {t.columns.length > 12 && <text className="er-type" x="10" y={28 + 12 * ROW + 13}>+{t.columns.length - 12} more</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
