import { useState } from 'react'
import { addEdit, editorFor, jsonProblem, OPS, parseCell, parseTsv, toSql, type Edit, type Op, type View } from '../shared/gridsql'
import type { DbColumn, DbConn, DbResult } from '../electron/db'
import { StateMark } from './StateMark'
import { IconAdd, IconCheck, IconTrash } from './icons'
import './bridge'

const show = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : String(v))

/**
 * A table's rows as a sheet you can edit: double-click a cell, add a row, remove a row. Nothing is written
 * as you go: the edits pile up as SQL you read, then run in one transaction, on a connection with writes on.
 * Rows are found by their primary key; a table without one stays read-only.
 */
export function DataGrid(props: { conn: DbConn; table: { schema: string; name: string }; columns: DbColumn[]; res: DbResult; onDone: (note: string) => void; view?: View; total?: number | null; onView?: (v: View) => void }) {
  const { conn, res } = props
  const cols = res.columns.map((n) => props.columns.find((c) => c.name === n) ?? { name: n, type: '', nullable: true, pk: false })
  const pks = cols.filter((c) => c.pk).map((c) => c.name)
  const editable = pks.length > 0 && pks.every((p) => res.columns.includes(p))
  const [edits, setEdits] = useState<Edit[]>([])
  const [added, setAdded] = useState<Record<string, unknown>[]>([])
  const [cell, setCell] = useState<{ r: number; c: number; text: string } | null>(null)
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null)
  const keyOf = (row: unknown[]) => Object.fromEntries(pks.map((p) => [p, row[res.columns.indexOf(p)]]))
  const pending = (row: unknown[], c: string) => {
    const k = JSON.stringify(keyOf(row))
    const e = edits.find((x) => x.kind === 'update' && JSON.stringify(x.key) === k)
    return e && e.kind === 'update' && c in e.set ? { v: e.set[c] } : null
  }
  const removed = (row: unknown[]) => edits.some((x) => x.kind === 'delete' && JSON.stringify(x.key) === JSON.stringify(keyOf(row)))
  let sql: string[] = []
  let sqlErr = ''
  try {
    sql = toSql(conn.kind === 'tidb' ? 'mysql' : conn.kind, props.table.schema, props.table.name, [...edits, ...added.map((v) => ({ kind: 'insert' as const, values: v }))])
  } catch (e) {
    sqlErr = (e as Error).message
  }
  const [cellErr, setCellErr] = useState('')
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null)
  const [fcol, setFcol] = useState('')
  const [fop, setFop] = useState<Op>('contains')
  const [fval, setFval] = useState('')
  // one value into one cell: a pending edit on an existing row, or a field of a new row
  const put = (r: number, c: number, text: string, eds: Edit[], adds: Record<string, unknown>[]) => {
    const col = cols[c]!
    const v = parseCell(text, col.type, col.nullable)
    if (r >= res.rows.length) {
      const j = r - res.rows.length
      while (adds.length <= j) adds = [...adds, {}]
      return { eds, adds: adds.map((a, i) => (i === j ? { ...a, [col.name]: v } : a)) }
    }
    const row = res.rows[r]!
    if (v === row[c] || removed(row)) return { eds, adds }
    return { eds: addEdit(eds, { kind: 'update', key: keyOf(row), set: { [col.name]: v } }), adds }
  }
  // a block copied from a spreadsheet lands from the picked cell, right and down; rows past the end become new rows
  const paste = (text: string) => {
    if (!sel || !editable || cell) return false
    const block = parseTsv(text)
    if (!block.length) return false
    let st = { eds: edits, adds: added }
    block.forEach((line, dr) => line.forEach((t, dc) => {
      if (sel.c + dc < cols.length) st = put(sel.r + dr, sel.c + dc, t, st.eds, st.adds)
    }))
    setEdits(st.eds)
    setAdded(st.adds)
    setReview(false)
    setMsg({ t: `Pasted ${block.length} × ${Math.max(...block.map((l) => l.length))} cells as pending changes; review the SQL before running it.` })
    return true
  }
  const commit = () => {
    if (!cell) return
    const col = cols[cell.c]!
    const ed = editorFor(col.type)
    if (ed === 'json') {
      const bad = jsonProblem(cell.text)
      if (bad) return setCellErr(`Not JSON: ${bad}`)
    }
    setCellErr('')
    // a datetime field gives 2026-10-26T14:30; databases want 2026-10-26 14:30:00
    const text = ed === 'datetime' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cell.text) ? `${cell.text.replace('T', ' ')}:00` : cell.text
    const v = parseCell(text, col.type, col.nullable)
    if (cell.r >= res.rows.length) setAdded(added.map((a, i) => (i === cell.r - res.rows.length ? { ...a, [col.name]: v } : a)))
    else {
      const row = res.rows[cell.r]!
      const was = row[cell.c]
      if (v === was || (v === null && was === null)) setCell(null)
      else setEdits(addEdit(edits, { kind: 'update', key: keyOf(row), set: { [col.name]: v } }))
    }
    setCell(null)
    setReview(false)
  }
  const run = async () => {
    setBusy(true)
    setMsg(null)
    const r = await window.stm.db.apply(conn.id, sql)
    setBusy(false)
    if (r.ok) {
      setEdits([])
      setAdded([])
      setReview(false)
      props.onDone(`Done: ${r.changed} ${r.changed === 1 ? 'row' : 'rows'} changed in ${r.ms} ms, in one transaction.`)
    } else setMsg({ t: `Nothing was changed: ${r.at >= 0 ? `statement ${r.at + 1} failed, ` : ''}${r.error}`, bad: true })
  }
  const n = edits.length + added.length
  const rows: { row: unknown[]; isNew: boolean; i: number }[] = [...res.rows.map((row, i) => ({ row, isNew: false, i })), ...added.map((a, j) => ({ row: res.columns.map((c) => a[c]), isNew: true, i: res.rows.length + j }))]
  return (
    <>
      <div className="grd-bar">
        {editable ? <span className="faint">Double-click a cell to change it. Rows are matched by {pks.join(', ')}.</span> : <span className="faint">Read-only here: {pks.length ? 'the primary key is not in these columns' : 'this table has no primary key'}.</span>}
        <span className="spacer-flex" />
        {editable && <button className="ghost small" onClick={() => setAdded([...added, {}])}><IconAdd />Add row</button>}
        {n > 0 && (
          <>
            <span className="grd-n">{n} {n === 1 ? 'change' : 'changes'}</span>
            <button className="ghost small" onClick={() => (setEdits([]), setAdded([]), setReview(false))}>Discard</button>
            <button className="primary small" onClick={() => setReview(!review)}>{review ? 'Hide SQL' : 'Review SQL'}</button>
          </>
        )}
      </div>
      {props.view && props.onView && <GridNav view={props.view} total={props.total ?? null} shown={res.rows.length} columns={res.columns} onView={props.onView} fcol={fcol || res.columns[0] || ''} setFcol={setFcol} fop={fop} setFop={setFop} fval={fval} setFval={setFval} />}
      {review && (
        <div className="grd-review">
          {sqlErr ? <div className="notice error">{sqlErr}</div> : <pre className="ob-pre">{sql.join('\n')}</pre>}
          {!conn.writes && <div className="notice">This connection is read-only. Turn writes on in its settings to run these.</div>}
          <div className="ob-row">
            <span className="faint">All of it runs in one transaction{conn.kind === 'd1' ? ' (a D1 batch)' : ''}: if one statement fails, nothing changes.</span>
            <span className="spacer-flex" />
            <button className="primary small" disabled={busy || !conn.writes || !!sqlErr || !sql.length} onClick={() => void run()}>{busy ? <StateMark state="busy" label="Running" /> : <IconCheck />}Run {sql.length} {sql.length === 1 ? 'statement' : 'statements'}</button>
          </div>
        </div>
      )}
      {msg && <div className={msg.bad ? 'notice error' : 'notice'}>{msg.t}</div>}
      {cellErr && <div className="notice error">{cellErr}</div>}
      <div className="dbv-grid" tabIndex={0} onPaste={(e) => { if (paste(e.clipboardData.getData('text/plain'))) e.preventDefault() }}>
        <table>
          <thead>
            <tr>{editable && <th className="grd-x" />}{cols.map((c, i) => {
              const s0 = props.view?.sort?.col === c.name ? (props.view.sort.desc ? ' ↓' : ' ↑') : ''
              const sortBy = () => props.view && props.onView?.({ ...props.view, page: 0, sort: props.view.sort?.col === c.name && !props.view.sort.desc ? { col: c.name, desc: true } : props.view.sort?.col === c.name ? undefined : { col: c.name, desc: false } })
              return <th key={i} className={`${typeof res.rows[0]?.[i] === 'number' ? 'num' : ''} ${props.onView ? 'grd-sortable' : ''}`} title={`${c.type}${c.nullable ? '' : ', not null'}${props.onView ? ' · click to sort' : ''}`} onClick={sortBy}>{c.pk && <span className="grd-pk">PK</span>}{c.name}<span className="grd-sort">{s0}</span></th>
            })}</tr>
          </thead>
          <tbody>
            {rows.map(({ row, isNew, i }) => {
              const gone = !isNew && removed(row)
              return (
                <tr key={i} className={`${isNew ? 'grd-new' : ''} ${gone ? 'grd-gone' : ''}`}>
                  {editable && (
                    <td className="grd-x">
                      <button className="icon" aria-label={isNew ? 'Remove the new row' : gone ? 'Keep this row' : 'Remove this row'} onClick={() => {
                        if (isNew) setAdded(added.filter((_, j) => j !== i - res.rows.length))
                        else if (gone) setEdits(edits.filter((x) => !(x.kind === 'delete' && JSON.stringify(x.key) === JSON.stringify(keyOf(row)))))
                        else setEdits(addEdit(edits, { kind: 'delete', key: keyOf(row) }))
                        setReview(false)
                      }}><IconTrash /></button>
                    </td>
                  )}
                  {row.map((v0, j) => {
                    const p = isNew ? null : pending(row, res.columns[j]!)
                    const v = p ? p.v : v0
                    const s = show(v)
                    const open = cell && cell.r === i && cell.c === j
                    return (
                      <td key={j} className={`${typeof v === 'number' ? 'num' : s === null ? 'null' : ''} ${p ? 'grd-changed' : ''} ${sel?.r === i && sel.c === j ? 'grd-sel' : ''}`} title={p ? `was: ${show(v0) ?? 'NULL'}` : s ?? 'NULL'} onClick={() => setSel({ r: i, c: j })} onDoubleClick={() => editable && !gone && setCell({ r: i, c: j, text: editorFor(cols[j]!.type) === 'datetime' && s ? s.slice(0, 16).replace(' ', 'T') : s ?? '' })}>
                        {open ? (
                          <CellEditor col={cols[j]!} text={cell.text} onText={(t) => setCell({ ...cell, text: t })} onDone={commit} onCancel={() => (setCell(null), setCellErr(''))} />
                        ) : s === null ? (isNew ? '' : 'NULL') : s.length > 120 ? `${s.slice(0, 120)}…` : s}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** The editor for one cell, by its column's type: a select for booleans, date pickers, a JSON box, else text. */
function CellEditor(props: { col: DbColumn; text: string; onText: (t: string) => void; onDone: () => void; onCancel: () => void }) {
  const { col } = props
  const ed = editorFor(col.type)
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') props.onCancel()
    else if (e.key === 'Enter' && (ed !== 'json' || e.metaKey || e.ctrlKey)) props.onDone()
  }
  const label = `${col.name} value`
  if (ed === 'bool')
    return (
      <select autoFocus className="grd-input" value={props.text === '' ? (col.nullable ? '' : 'false') : /^(1|true)$/i.test(props.text) ? 'true' : 'false'} onChange={(e) => props.onText(e.target.value)} onBlur={props.onDone} onKeyDown={keys} aria-label={label}>
        <option value="true">true</option>
        <option value="false">false</option>
        {col.nullable && <option value="">NULL</option>}
      </select>
    )
  if (ed === 'json') return <textarea autoFocus className="grd-input grd-json" value={props.text} onChange={(e) => props.onText(e.target.value)} onBlur={props.onDone} onKeyDown={keys} aria-label={label} spellCheck={false} title="Cmd+Enter keeps it" />
  const type = ed === 'date' ? 'date' : ed === 'datetime' ? 'datetime-local' : 'text'
  return <input autoFocus className="grd-input" type={type} inputMode={ed === 'number' ? 'decimal' : undefined} value={props.text} onChange={(e) => props.onText(e.target.value)} onBlur={props.onDone} onKeyDown={keys} aria-label={label} />
}

/** Pages, page size and filters for a table opened in the grid. */
function GridNav(props: { view: View; total: number | null; shown: number; columns: string[]; onView: (v: View) => void; fcol: string; setFcol: (s: string) => void; fop: Op; setFop: (o: Op) => void; fval: string; setFval: (s: string) => void }) {
  const { view, total } = props
  const from = view.page * view.size
  const last = total === null ? props.shown < view.size : from + view.size >= total
  const add = () => {
    if (!props.fcol || (props.fval === '' && props.fop !== 'null' && props.fop !== 'not null')) return
    props.onView({ ...view, page: 0, filters: [...view.filters, { col: props.fcol, op: props.fop, value: props.fval }] })
    props.setFval('')
  }
  return (
    <div className="grd-nav">
      <form className="grd-filter" onSubmit={(e) => (e.preventDefault(), add())}>
        <span className="grd-tag">WHERE</span>
        <select value={props.fcol} onChange={(e) => props.setFcol(e.target.value)} aria-label="Filter column">{props.columns.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={props.fop} onChange={(e) => props.setFop(e.target.value as Op)} aria-label="Filter operator">{OPS.map((o) => <option key={o} value={o}>{o === 'null' ? 'is null' : o === 'not null' ? 'is not null' : o}</option>)}</select>
        {props.fop !== 'null' && props.fop !== 'not null' && <input value={props.fval} onChange={(e) => props.setFval(e.target.value)} placeholder="value" aria-label="Filter value" />}
        <button className="ghost small" type="submit">Add filter</button>
        {view.filters.map((f, i) => (
          <span key={i} className="grd-chip">
            <code>{f.col} {f.op === 'null' ? 'is null' : f.op === 'not null' ? 'is not null' : `${f.op} ${f.value}`}</code>
            <button className="att-x" aria-label="Remove filter" onClick={() => props.onView({ ...view, page: 0, filters: view.filters.filter((_, j) => j !== i) })}>×</button>
          </span>
        ))}
      </form>
      <span className="spacer-flex" />
      <span className="grd-count">{props.shown ? `${(from + 1).toLocaleString()}–${(from + props.shown).toLocaleString()}` : '0'}{total !== null ? ` of ${total.toLocaleString()}` : ''}</span>
      <select value={view.size} onChange={(e) => props.onView({ ...view, page: 0, size: Number(e.target.value) })} aria-label="Rows per page">{[50, 100, 250, 500].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
      <button className="ghost small" disabled={view.page === 0} onClick={() => props.onView({ ...view, page: view.page - 1 })} aria-label="Previous page">‹</button>
      <button className="ghost small" disabled={last} onClick={() => props.onView({ ...view, page: view.page + 1 })} aria-label="Next page">›</button>
    </div>
  )
}
