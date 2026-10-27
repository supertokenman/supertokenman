import { useEffect, useMemo, useState } from 'react'
import { IconClose, IconEdit } from './icons'
import { RowAct, RowActs } from './RowActs'
import type { DbConn, DbKind, DbResult, DbSchema, DbTable, PlanNode } from '../electron/db'
import { StateMark } from './StateMark'
import { DataGrid } from './DataGrid'
import { DbConnect } from './DbConnect'
import { ErDiagram, PlanView, SqlEditor } from './DbTools'
import { clean as cleanErr } from './errors'
import { vectorColumns, vectorSql } from '../shared/tidb'
import { browseSql, countSql, firstView, type View } from '../shared/gridsql'

const fresh = (): DbConn => ({ id: `d${Date.now().toString(36)}`, name: '', kind: 'postgres', target: '', writes: false })
const qi = (s: string, k?: DbKind) => (k === 'mysql' || k === 'tidb' ? `\`${s.replace(/`/g, '``')}\`` : `"${s.replace(/"/g, '""')}"`)
const KINDS: { k: DbKind; label: string; short: string }[] = [
  { k: 'postgres', label: 'Postgres', short: 'PG' },
  { k: 'mysql', label: 'MySQL', short: 'MY' },
  { k: 'tidb', label: 'TiDB', short: 'TIDB' },
  { k: 'sqlite', label: 'SQLite', short: 'SQLITE' },
  { k: 'd1', label: 'D1', short: 'D1' },
]
const kRows = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
const show = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : String(v))

/**
 * The database viewer: Postgres (Supabase, Neon, any) and SQLite. Passwords stay in the vault as
 * {{NAME}}; every connection is read-only until writes are turned on for it. Tables with their size,
 * a query box (Cmd+Enter), the rows, and one click to hand a result to Claude.
 */
export function DatabaseSheet(props: { onClose: () => void; onAttach: (note: { label: string; text: string }) => void; cwd?: string; onDiagram?: (path: string) => void }) {
  const [conns, setConns] = useState<DbConn[]>([])
  const [secrets, setSecrets] = useState<string[]>([])
  const [cur, setCur] = useState<DbConn | null>(null)
  const [editing, setEditing] = useState<DbConn | null>(null)
  const [list, setList] = useState<DbTable[] | null>(null)
  const [state, setState] = useState<'off' | 'busy' | 'up' | 'down'>('off')
  const [error, setError] = useState('')
  const [sql, setSql] = useState('')
  const [res, setRes] = useState<DbResult | null>(null)
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState('')
  const [schema, setSchema] = useState<DbSchema | null>(null)
  const [view, setView] = useState<'rows' | 'plan' | 'er'>('rows')
  const [plan, setPlan] = useState<PlanNode[] | null>(null)
  const [history, setHistory] = useState<{ sql: string; at: number; ok: boolean; ms: number }[]>([])
  const [ask, setAsk] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  // the table the rows came from, when a click on a table opened them: then they can be edited
  const [gridOf, setGridOf] = useState<{ schema: string; name: string; sql: string } | null>(null)
  const [gview, setGview] = useState<View>(firstView())
  const [gtotal, setGtotal] = useState<number | null>(null)

  useEffect(() => {
    void window.stm.db.list().then((d) => {
      setConns(d.conns)
      setSecrets(d.secrets)
      if (!d.conns.length) setEditing(fresh())
    })
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props])

  const open = async (c: DbConn) => {
    setCur(c)
    setEditing(null)
    setList(null)
    setRes(null)
    setError('')
    setState('busy')
    const t = await window.stm.db.tables(c.id)
    if ('error' in t) {
      setState('down')
      setError(t.error)
      return
    }
    setState('up')
    setList(t)
    setSchema(null)
    setView('rows')
    void window.stm.db.schema(c.id).then(setSchema, () => setSchema(null))
    void window.stm.db.history(c.id).then(setHistory)
  }
  const doing = async (k: string, f: () => Promise<void>) => {
    setBusy(k)
    setNote('')
    try {
      await f()
    } catch (e) {
      setNote(cleanErr(e))
    }
    setBusy('')
  }
  const run = async (text = sql) => {
    if (!cur || !text.trim() || running) return
    setGridOf(null)
    setRunning(true)
    setView('rows')
    setRes(await window.stm.db.query(cur.id, text))
    setRunning(false)
    void window.stm.db.history(cur.id).then(setHistory)
  }
  // a table in the grid: its page, sort and filters become the SELECT in the editor, and its row count
  const browse = (t: { schema: string; name: string }, v: View) => {
    if (!cur) return
    const d = cur.kind === 'tidb' ? 'mysql' : cur.kind
    const cols = schema?.tables.find((x) => x.name === t.name)?.columns.map((c) => c.name) ?? []
    const q = browseSql(d, t.schema, t.name, cols, v)
    setSql(q)
    setGview(v)
    void run(q).then(() => setGridOf({ schema: t.schema, name: t.name, sql: q }))
    void window.stm.db.query(cur.id, countSql(d, t.schema, t.name, cols, v)).then((r) => setGtotal(r.error ? null : Number(r.rows[0]?.[0] ?? 0)), () => setGtotal(null))
  }
  const pick = (t: DbTable) => {
    if (t.kind === 'table') return browse(t, firstView())
    const q = `select * from ${cur?.kind === 'postgres' ? `${qi(t.schema)}.` : ''}${qi(t.name, cur?.kind)} limit 100`
    setSql(q)
    void run(q).then(() => setGridOf(null))
  }
  const save = async (e: DbConn) => {
    if (!e.target.trim()) return
    const c = { ...e, name: e.kind === 'sqlite' && e.name === 'SQLite' ? e.target.split('/').pop() ?? 'SQLite' : e.name }
    setConns(await window.stm.db.save(c))
    void open(c)
  }
  const toClaude = () => {
    if (!res || !cur) return
    const head = `| ${res.columns.join(' | ')} |\n| ${res.columns.map(() => '---').join(' | ')} |`
    const body = res.rows.slice(0, 30).map((r) => `| ${r.map((v) => String(show(v) ?? 'NULL').replace(/\|/g, '\\|').slice(0, 80)).join(' | ')} |`).join('\n')
    props.onAttach({
      label: `Query · ${res.count} rows`,
      text: `A query on my ${KINDS.find((x) => x.k === cur.kind)!.label} database "${cur.name}":\n\`\`\`sql\n${sql}\n\`\`\`\n${res.error ? `It failed: ${res.error}` : res.columns.length ? `${res.count} rows${res.count > 30 ? ' (first 30)' : ''}:\n\n${head}\n${body}` : res.command ?? ''}`,
    })
    props.onClose()
  }
  const max = useMemo(() => Math.max(1, ...(list ?? []).map((t) => t.rows ?? 0)), [list])
  const shown = (list ?? []).filter((t) => !filter || `${t.schema}.${t.name}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet dbv" role="dialog" aria-label="Database">
        <header className="sheet-head">
          <div className="sheet-title">Database</div>
          <span className="faint">Read-only unless you turn writes on</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="dbv-body">
          <aside className="dbv-side">
            <div className="dbv-conns">
              {conns.map((c) => (
                <div key={c.id} className="dbv-conn-row row-host">
                <button className={`dbv-conn ${cur?.id === c.id ? 'on' : ''}`} onClick={() => void open(c)} title={c.target}>
                  {cur?.id === c.id ? <StateMark state={state} label={state === 'up' ? 'Connected' : state === 'busy' ? 'Connecting' : state === 'down' ? 'Failed' : 'Not open'} /> : <StateMark state="off" label="Not open" />}
                  <span className={`dbv-kind ${c.kind}`}>{KINDS.find((x) => x.k === c.kind)?.short ?? 'PG'}</span>
                  <span className="dbv-name">{c.name}</span>
                  {c.writes && <span className="dbv-w" title="Writes are on">W</span>}
                </button>
                <RowActs><RowAct label={`Edit ${c.name}`} icon={<IconEdit />} onClick={() => (setCur(c), setEditing(c))} /></RowActs>
                </div>
              ))}
              <button className="small" onClick={() => (setEditing(fresh()), setCur(null))}>New connection</button>
            </div>
            {cur && list && (
              <>
                <input className="dbv-filter" value={filter} placeholder={`Filter ${list.length} tables`} onChange={(e) => setFilter(e.target.value)} />
                <div className="dbv-tables">
                  {shown.map((t) => (
                    <button key={`${t.schema}.${t.name}`} className="dbv-table" onClick={() => pick(t)} title={`${t.schema}.${t.name}`}>
                      <svg viewBox="0 0 10 10" className={`dbv-ico ${t.kind}`} aria-hidden>{t.kind === 'view' ? <circle cx="5" cy="5" r="3.6" /> : <rect x="1.2" y="1.2" width="7.6" height="7.6" />}</svg>
                      <span className="dbv-tname">{t.schema !== 'public' && t.schema !== 'main' ? <span className="faint">{t.schema}.</span> : null}{t.name}</span>
                      {t.rows !== undefined && <span className="dbv-count">{kRows(t.rows)}</span>}
                      {t.rows !== undefined && <i className="dbv-bar" style={{ width: `${Math.max(2, (t.rows / max) * 100)}%` }} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
          <section className="dbv-main">
            {editing ? (
              <DbConnect key={editing.id} editing={editing} isNew={!conns.some((c) => c.id === editing.id)} secrets={secrets} onChange={setEditing} onSave={(c) => void save(c)} onDelete={conns.some((c) => c.id === editing.id) ? async () => (setConns(await window.stm.db.delete(editing.id)), setEditing(null)) : undefined} />
            ) : !cur ? (
              <div className="faint dbv-note">Pick a connection.</div>
            ) : (
              <>
                {error && (
                  <div className="dbv-error">
                    <StateMark state="down" size="md" label="Failed" />
                    <span>{error}</span>
                    <button className="ghost small" onClick={() => setEditing(cur)}>Edit connection</button>
                  </div>
                )}
                <div className="dbv-editor">
                  <SqlEditor value={sql} onChange={setSql} onRun={() => void run()} schema={schema} placeholder="select * from users limit 50   (Cmd+Enter runs; Tab takes a suggestion)" />
                  <div className="dbv-run">
                    <span className="faint">{cur.writes ? 'Writes are on' : 'Read-only'}{cur.ssh ? ` · via ${cur.ssh}` : ''}</span>
                    {history.length > 0 && (
                      <select className="dbv-hist" aria-label="Query history" value="" onChange={(e) => e.target.value && setSql(e.target.value)}>
                        <option value="">History ({history.length})</option>
                        {history.map((h) => <option key={h.at} value={h.sql}>{h.ok ? '' : '✕ '}{h.sql.replace(/\s+/g, ' ').slice(0, 70)}</option>)}
                      </select>
                    )}
                    <span className="spacer-flex" />
                    <button className={`ghost small ${view === 'er' ? 'on' : ''}`} disabled={!schema} onClick={() => setView(view === 'er' ? 'rows' : 'er')} title="The tables and their foreign keys">Diagram</button>
                    <button className="ghost small" disabled={!sql.trim() || !!busy || state !== 'up'} onClick={() => void doing('plan', async () => { setPlan(await window.stm.db.explain(cur.id, sql)); setView('plan') })} title="How the database will run it, without running it">{busy === 'plan' ? 'Explaining…' : 'Explain'}</button>
                    <button className="ghost small" onClick={() => setEditing(cur)}>Edit</button>
                    <button className="primary small" disabled={!sql.trim() || running || state !== 'up'} onClick={() => void run()}>{running ? 'Running' : 'Run'}</button>
                  </div>
                </div>
                {cur.kind === 'tidb' && schema && vectorColumns(schema.tables).length > 0 && <VectorAsk cols={vectorColumns(schema.tables)} onSql={setSql} onError={setError} />}
                <div className="dbv-ask">
                  <input id="db-ask" value={ask} placeholder="Or ask in plain words: orders per customer this month (the local model writes the SQL; you run it)" onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => {
                    if (e.key === 'Enter' && ask.trim()) void doing('ask', async () => setSql(await window.stm.db.ask(cur.id, ask)))
                  }} />
                  <button className="ghost small" disabled={!ask.trim() || !!busy} onClick={() => void doing('ask', async () => setSql(await window.stm.db.ask(cur.id, ask)))}>{busy === 'ask' ? 'Writing…' : 'Write SQL'}</button>
                </div>
                {note && (/^(Saved|Done)/.test(note) ? <div className="notice">{note}</div> : <div className="dbv-error"><StateMark state="down" size="md" label="Failed" /><span>{note}</span></div>)}
                {view === 'plan' && plan && (
                  <div className="dbv-res up">
                    <div className="dbv-res-head"><StateMark state="up" size="md" label="Plan" /><span className="api-meta">{cur.kind === 'tidb' ? 'EXPLAIN ANALYZE when the query only reads: it ran, so rows and time are actual' : 'The plan, without running the query'}</span><span className="spacer-flex" /><button className="ghost small" onClick={() => setView('rows')}>Back to rows</button></div>
                    <PlanView plan={plan} />
                  </div>
                )}
                {view === 'er' && schema && (
                  <div className="dbv-res up">
                    <div className="dbv-res-head"><StateMark state="up" size="md" label="Diagram" /><span className="api-meta">{schema.tables.length} {schema.tables.length === 1 ? "table" : "tables"} · {schema.fks.length} {schema.fks.length === 1 ? "foreign key" : "foreign keys"}{schema.tables.length > 60 ? ' · first 60 shown' : ''}</span><span className="spacer-flex" />{props.cwd && props.onDiagram && <button className="ghost small" title="Writes diagrams/er-….drawio in the focused project" onClick={() => void window.stm.diagram.er(props.cwd!, cur?.name ?? 'database', schema).then(props.onDiagram!, (e) => setError(cleanErr(e)))}>Save as .drawio</button>}<button className="ghost small" onClick={() => setView('rows')}>Back to rows</button></div>
                    <ErDiagram schema={schema} onPick={(t) => { const tb = list?.find((x) => x.name === t); if (tb) pick(tb) }} />
                  </div>
                )}
                {view === 'rows' && <div className={`dbv-res ${res?.error ? 'down' : res ? 'up' : running ? 'busy' : 'off'}`}>
                  <div className="dbv-res-head">
                    <StateMark state={running ? 'busy' : res?.error ? 'down' : res ? 'up' : 'off'} size="md" label={running ? 'Running' : res?.error ? 'Failed' : res ? 'Done' : 'Nothing run yet'} />
                    {res?.error ? <span className="api-err">{res.error}</span> : res ? <span className="api-meta">{res.command ?? `${res.count.toLocaleString()} rows${res.cut ? ', first 500 shown' : ''}`} · {res.ms} ms</span> : <span className="faint">Click a table, or write a query.</span>}
                    <span className="spacer-flex" />
                    {res && res.columns.length > 0 && (
                      <>
                        <button className="ghost small" disabled={!!busy} onClick={() => void doing('csv', async () => { const r = await window.stm.db.exportRows(cur.id, sql, 'csv'); if (r) setNote(`Saved ${r.rows.toLocaleString()} rows to ${r.file}${r.cut ? ' (the first 200,000)' : ''}`) })}>CSV</button>
                        <button className="ghost small" disabled={!!busy} onClick={() => void doing('json', async () => { const r = await window.stm.db.exportRows(cur.id, sql, 'json'); if (r) setNote(`Saved ${r.rows.toLocaleString()} rows to ${r.file}${r.cut ? ' (the first 200,000)' : ''}`) })}>JSON</button>
                      </>
                    )}
                    {res && <button className="small" onClick={toClaude}>Send to Claude</button>}
                  </div>
                  {res && res.columns.length > 0 && gridOf && gridOf.sql === sql && schema?.tables.find((t) => t.name === gridOf.name) ? (
                    <DataGrid key={`${gridOf.name}:${res.ms}`} conn={cur} table={gridOf} columns={schema.tables.find((t) => t.name === gridOf.name)!.columns} res={res} view={gview} total={gtotal} onView={(v) => browse(gridOf, v)} onDone={(n) => (browse(gridOf, gview), setNote(n))} />
                  ) : res && res.columns.length > 0 && (
                    <div className="dbv-grid">
                      <table>
                        <thead>
                          <tr>{res.columns.map((c, i) => <th key={i} className={typeof res.rows[0]?.[i] === 'number' ? 'num' : ''}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {res.rows.map((r, i) => (
                            <tr key={i}>
                              {r.map((v, j) => {
                                const s = show(v)
                                return <td key={j} className={typeof v === 'number' ? 'num' : s === null ? 'null' : ''} title={s ?? 'NULL'}>{s === null ? 'NULL' : s.length > 120 ? `${s.slice(0, 120)}…` : s}</td>
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** Phase 123: a nearest-rows query on a TiDB VECTOR column, written into the editor to read before running. */
function VectorAsk(props: { cols: ReturnType<typeof vectorColumns>; onSql: (s: string) => void; onError: (s: string) => void }) {
  const [pick, setPick] = useState(0)
  const [vec, setVec] = useState('')
  const [k, setK] = useState(10)
  const [metric, setMetric] = useState<'cosine' | 'l2'>('cosine')
  const c = props.cols[pick] ?? props.cols[0]!
  const build = () => {
    try {
      props.onSql(vectorSql({ table: c.table, column: c.column, vector: vec, k, metric, show: c.others }))
    } catch (e) {
      props.onError(cleanErr(e))
    }
  }
  return (
    <div className="dbv-vec">
      <span className="dbv-vec-tag">VECTOR</span>
      <select aria-label="Vector column" value={pick} onChange={(e) => setPick(Number(e.target.value))}>{props.cols.map((x, i) => <option key={`${x.table}.${x.column}`} value={i}>{x.table}.{x.column}</option>)}</select>
      <input className="mono" value={vec} placeholder="[0.12, -0.5, 0.33]  nearest rows to this vector" spellCheck={false} onChange={(e) => setVec(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && build()} aria-label="Vector" />
      <select aria-label="Distance" value={metric} onChange={(e) => setMetric(e.target.value as 'cosine' | 'l2')}><option value="cosine">cosine</option><option value="l2">L2</option></select>
      <input className="dbv-vec-k" type="number" min={1} max={200} value={k} onChange={(e) => setK(Number(e.target.value) || 10)} aria-label="How many" />
      <button className="ghost small" disabled={!vec.trim()} onClick={build}>Write query</button>
    </div>
  )
}
