import { useEffect, useState } from 'react'
import { chartOf, seriesOf, type BoardItem } from '../shared/askdata'
import type { DbConn, DbResult } from '../electron/db'
import { Chart } from './Chart'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconBoard, IconClose, IconRefresh, IconSpark, IconTrash } from './icons'
import './bridge'

const show = (v: unknown) => (v === null || v === undefined ? 'NULL' : String(v))

/** An answer as a number, a chart or a table, picked from its shape. */
function Answer(props: { res: DbResult; label: string; height?: number }) {
  const { res } = props
  if (res.error) return <div className="notice error">{res.error}</div>
  const p = chartOf(res.columns, res.rows)
  if (p.kind === 'number') return <div className="ad-number"><b>{p.value.toLocaleString()}</b><span className="fld-label">{p.label}</span></div>
  return (
    <>
      {(p.kind === 'line' || p.kind === 'bar') && (() => {
        const series = seriesOf(res.columns, res.rows, p)
        const tops = series.map((x) => Math.max(1e-9, ...x.points.map((pt) => Math.abs(pt[1]))))
        // measures of very different size never share an axis: one small chart each
        const apart = series.length > 1 && Math.max(...tops) / Math.min(...tops) > 10
        return apart ? (
          <div className="ad-multi">{series.slice(0, 4).map((x) => <Chart key={x.name} kind={p.kind} time={p.time} label={x.name} series={[x]} height={Math.round((props.height ?? 240) * 0.75)} />)}</div>
        ) : <Chart kind={p.kind} time={p.time} label={props.label} series={series} height={props.height ?? 240} />
      })()}
      <details className="ad-table" open={p.kind === 'table'}>
        <summary className="faint">{res.count.toLocaleString()} rows{res.cut ? ', first 500' : ''} · {res.ms} ms</summary>
        <div className="dbv-grid">
          <table>
            <thead><tr>{res.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{res.rows.slice(0, 100).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num' : v === null ? 'null' : ''}>{show(v)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  )
}

/**
 * Ask your data: a question about one of your databases becomes SQL written by the local model, which you
 * read and can change before it runs. It runs read-only, one statement, and the answer comes back as a
 * number, a chart or a table. Answers you keep form a dashboard that runs them again when you open it.
 */
export function AskDataSheet(props: { onClose: () => void }) {
  const [conns, setConns] = useState<DbConn[]>([])
  const [conn, setConn] = useState('')
  const [tab, setTab] = useState<'ask' | 'board'>('ask')
  const [q, setQ] = useState('')
  const [sql, setSql] = useState('')
  const [res, setRes] = useState<DbResult | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [board, setBoard] = useState<BoardItem[]>([])
  const [answers, setAnswers] = useState<Record<string, DbResult | 'busy'>>({})
  useEffect(() => {
    void window.stm.db.list().then((d) => (setConns(d.conns), setConn((c) => c || d.conns[0]?.id || '')))
    void window.stm.askData.board().then(setBoard)
  }, [])
  const refresh = (items = board) => {
    for (const it of items) {
      setAnswers((a) => ({ ...a, [it.id]: 'busy' }))
      void window.stm.askData.run(it.conn, it.sql).then((r) => setAnswers((a) => ({ ...a, [it.id]: r })))
    }
  }
  useEffect(() => {
    if (tab === 'board') refresh()
  }, [tab])
  const write = async () => {
    setBusy('write')
    setErr('')
    setRes(null)
    try {
      setSql(await window.stm.db.ask(conn, q))
    } catch (e) {
      setErr(clean(e))
    }
    setBusy('')
  }
  const run = async () => {
    setBusy('run')
    setRes(await window.stm.askData.run(conn, sql))
    setBusy('')
  }
  const name = (id: string) => conns.find((c) => c.id === id)?.name ?? id
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ad" role="dialog" aria-label="Ask your data">
        <header className="sheet-head">
          <div className="sheet-title">Ask your data</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'ask'} onClick={() => setTab('ask')}>Ask</button>
            <button role="tab" aria-selected={tab === 'board'} onClick={() => setTab('board')}>Dashboard{board.length ? ` · ${board.length}` : ''}</button>
          </div>
          <span className="spacer-flex" />
          {tab === 'board' && board.length > 0 && <button className="ghost small" onClick={() => refresh()}><IconRefresh />Run all again</button>}
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {tab === 'ask' ? (
          <div className="ad-body">
            {!conns.length ? <div className="faint">Add a connection in the Database screen first.</div> : (
              <>
                <div className="fld-grid">
                  <label className="fld"><span className="fld-label">Database</span><select value={conn} onChange={(e) => (setConn(e.target.value), setRes(null), setSql(''))}>{conns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label className="fld wide"><span className="fld-label">Question</span><input value={q} placeholder="Orders per status this month" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && void write()} /></label>
                </div>
                <div className="ob-row">
                  <span className="faint">The local model writes the SQL on this machine. Nothing runs until you press Run.</span>
                  <span className="spacer-flex" />
                  <button className="primary small" disabled={!q.trim() || !conn || !!busy} onClick={() => void write()}>{busy === 'write' ? <StateMark state="busy" label="Writing" /> : <IconSpark />}Write the SQL</button>
                </div>
                {err && <div className="notice error">{err}</div>}
                {sql !== '' && (
                  <>
                    <label className="fld"><span className="fld-label">SQL, read it first <span className="fld-kind">read-only, one statement</span></span><textarea rows={5} value={sql} spellCheck={false} onChange={(e) => (setSql(e.target.value), setRes(null))} /></label>
                    <div className="ob-row"><span className="spacer-flex" /><button className="primary small" disabled={!sql.trim() || !!busy} onClick={() => void run()}>{busy === 'run' ? <StateMark state="busy" label="Running" /> : null}Run</button></div>
                  </>
                )}
                {res && (
                  <div className="ad-answer">
                    <Answer res={res} label={q} />
                    {!res.error && (
                      <div className="ob-row">
                        <input className="ob-grow" value={title} placeholder={q || 'Title on the dashboard'} onChange={(e) => setTitle(e.target.value)} aria-label="Title on the dashboard" />
                        <button className="small" onClick={() => void window.stm.askData.keep({ conn, title: title || q, question: q, sql }).then((b) => (setBoard(b), setTitle(''), setErr('')), (e) => setErr(clean(e)))}><IconBoard />Keep on the dashboard</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="ad-board">
            {!board.length && <div className="faint">Answers you keep show up here, run again each time you open it.</div>}
            {board.map((it) => {
              const a = answers[it.id]
              return (
                <section key={it.id} className="ad-card">
                  <div className="ad-card-head">
                    <b>{it.title}</b>
                    <span className="faint">{name(it.conn)}</span>
                    <span className="spacer-flex" />
                    <button className="icon" aria-label="Remove from the dashboard" onClick={() => void window.stm.askData.drop(it.id).then(setBoard)}><IconTrash /></button>
                  </div>
                  {!a || a === 'busy' ? <div className="faint"><StateMark state="busy" label="Running" /> Running…</div> : <Answer res={a} label={it.title} height={180} />}
                  <details><summary className="faint">SQL</summary><pre className="ob-pre">{it.sql}</pre></details>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
