import { useEffect, useMemo, useRef, useState } from 'react'
import './control.css'
import { IconClose } from '../icons'
import { Select } from '../ui'
import { clean } from '../errors'
import { dayRange, rowHeight, visibleRange, ROW_H } from '../../shared/controlview'
import type { AuditRow } from '../../shared/auditlog'

const DECISIONS = ['allow', 'ask', 'deny', 'approved', 'refused', 'pause'] as const
const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const key = (r: AuditRow, i: number) => `${r.at}:${r.panel}:${i}`

/** The audit view: one day at a time, filters, a windowed table, receipt rows that open to the files they changed. */
export function AuditSheet(props: { panel?: string; onClose: () => void }) {
  const [days, setDays] = useState<string[] | null>(null)
  const [day, setDay] = useState('')
  const [panel, setPanel] = useState(props.panel ?? '')
  const [tool, setTool] = useState('')
  const [decision, setDecision] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [top, setTop] = useState(0)
  const [view, setView] = useState(400)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.stm.control.auditDays().then((d) => (setDays(d), setDay(d[0] ?? '')), (e) => (setErr(clean(e)), setDays([])))
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])
  // the query waits a moment after typing; filters other than text apply at once
  useEffect(() => {
    if (!day) return
    const t = setTimeout(() => {
      setErr('')
      window.stm.control
        .auditQuery({ ...dayRange(day), limit: 2000, ...(panel.trim() ? { panel: panel.trim() } : {}), ...(tool.trim() ? { tool: tool.trim() } : {}), ...(decision ? { decision: decision as AuditRow['decision'] } : {}), ...(text.trim() ? { text: text.trim() } : {}) })
        .then((r) => (setRows(r), setOpen(new Set()), box.current && (box.current.scrollTop = 0)), (e) => (setErr(clean(e)), setRows([])))
    }, 180)
    return () => clearTimeout(t)
  }, [day, panel, tool, decision, text])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setView(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows])

  const heights = useMemo(() => (rows ?? []).map((r, i) => rowHeight(r, open.has(key(r, i)))), [rows, open])
  const range = useMemo(() => visibleRange(heights, top, view), [heights, top, view])
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (!n.delete(k)) n.add(k); return n })

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet observe control audit-sheet" role="dialog" aria-label="Audit log">
        <header className="sheet-head">
          <div className="sheet-title">Audit log</div>
          <span className="faint">Every tool call, who decided, and what each turn changed. Stays on this computer.</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="sheet-body">
          <div className="au-filters" role="search">
            <label className="ctl-fld"><span>Day</span>
              <Select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} disabled={!days?.length}>
                {days?.length ? days.map((d) => <option key={d} value={d}>{d}</option>) : <option value="">No days yet</option>}
              </Select>
            </label>
            <label className="ctl-fld"><span>Panel</span><input value={panel} onChange={(e) => setPanel(e.target.value)} placeholder="Any panel" spellCheck={false} /></label>
            <label className="ctl-fld"><span>Tool</span><input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="Any tool" spellCheck={false} /></label>
            <label className="ctl-fld"><span>Decision</span>
              <Select aria-label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="">Any</option>
                {DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </label>
            <label className="ctl-fld"><span>Text</span><input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search the summary" spellCheck={false} /></label>
          </div>
          {err && <div className="notice error" role="alert">{err}</div>}
          {days && days.length === 0 ? (
            <div className="au-empty">Nothing is recorded yet. Once a panel runs a tool, each call appears here with the rule or person that decided it.</div>
          ) : (
            <div className="au-wrap" role="table" aria-label="Audit rows" aria-rowcount={rows?.length ?? 0}>
              <div className="au-head" role="row">
                <span role="columnheader">Time</span><span role="columnheader">Panel</span><span role="columnheader">Tool</span><span role="columnheader">Summary</span><span role="columnheader">Decision</span><span role="columnheader">By</span><span role="columnheader">Rule</span>
              </div>
              <div className="au-scroll" ref={box} onScroll={(e) => setTop(e.currentTarget.scrollTop)} tabIndex={0} aria-label="Rows">
                {rows && rows.length === 0 && <div className="au-empty">No rows match these filters on {day}.</div>}
                <div style={{ height: range.before }} aria-hidden="true" />
                {(rows ?? []).slice(range.start, range.end).map((r, j) => {
                  const i = range.start + j
                  const k = key(r, i)
                  const canOpen = r.kind === 'receipt' && Boolean(r.files?.length)
                  return (
                    <div key={k} role="presentation">
                      <div className="au-row" role="row" style={{ height: ROW_H }}>
                        <span className="mono" role="cell">{time(r.at)}</span>
                        <span className="mono" role="cell" data-tip={r.panel}>{r.panel}</span>
                        <span role="cell">{r.kind === 'tool' ? r.tool : `${r.kind}`}</span>
                        <span role="cell" data-tip={r.args}>
                          {canOpen ? (
                            <button className="au-open" aria-expanded={open.has(k)} onClick={() => toggle(k)}>{open.has(k) ? 'Hide' : 'Show'} {r.files!.length} {r.files!.length === 1 ? 'file' : 'files'}: {r.args}</button>
                          ) : r.args}
                        </span>
                        <span role="cell" className={`au-dec d-${r.decision}`}>{r.decision}</span>
                        <span role="cell">{r.by}</span>
                        <span role="cell" className="mono" data-tip={r.rule}>{r.rule ?? ''}</span>
                      </div>
                      {canOpen && open.has(k) && (
                        <ul className="au-files" aria-label="Changed files">
                          {r.files!.map((f) => (<li key={f.path}><span className={`ch ${f.change}`}>{f.change}</span><span>{f.path}</span></li>))}
                        </ul>
                      )}
                    </div>
                  )
                })}
                <div style={{ height: range.after }} aria-hidden="true" />
              </div>
            </div>
          )}
          <div className="au-foot">{rows ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${rows.length >= 2000 ? ' (the first 2000; narrow the filters)' : ''}` : ''}</div>
        </div>
      </div>
    </div>
  )
}
