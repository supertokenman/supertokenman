import { useEffect, useMemo, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { board, filter, type Note } from '../shared/fmviews'

const KEY = 'stm.vaultBoard'
const saved = (): { q: string; by: string; order: string; view: 'board' | 'table' } => {
  try {
    return { q: 'type=task', by: 'status', order: 'todo, doing, done', view: 'board', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { q: 'type=task', by: 'status', order: 'todo, doing, done', view: 'board' }
  }
}
const show = (v: Note['data'][string] | undefined) => (Array.isArray(v) ? v.join(', ') : (v ?? ''))

/** Phase 104: notes of the vault by their frontmatter, as a table or a board; moving a card sets the field. */
export function VaultBoard(props: { onClose: () => void }) {
  const [opts, setOpts] = useState(saved)
  const [notes, setNotes] = useState<Note[]>([])
  const [msg, setMsg] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  const load = () => void window.stm.vaultBoard.notes().then((r) => setNotes(r.notes), (e) => setMsg(clean(e)))
  useEffect(load, [])
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(opts)) } catch { /* remembered next time, or not */ } }, [opts])
  const shown = useMemo(() => filter(notes, opts.q), [notes, opts.q])
  const order = opts.order.split(',').map((x) => x.trim()).filter(Boolean)
  const cols = useMemo(() => board(shown, opts.by.trim() || 'status', order), [shown, opts.by, opts.order])
  const fields = useMemo(() => [...new Set(shown.flatMap((n) => Object.keys(n.data)))].filter((k) => k !== 'title').slice(0, 6), [shown])
  const move = (file: string, to: string) => {
    const n = notes.find((x) => x.file === file)
    if (!n || to === '(none)' || show(n.data[opts.by]) === to) return
    void window.stm.vaultBoard.set(file, opts.by, to, n.mtime ?? 0).then((mtime) => setNotes((all) => all.map((x) => (x.file === file ? { ...x, mtime, data: { ...x.data, [opts.by]: to } } : x))), (e) => setMsg(clean(e)))
  }
  const importEnex = () => void window.stm.vaultBoard.importEnex().then((r) => r && (setMsg(`Imported ${r.notes} notes and ${r.files} attachments into ${r.folder}.`), load()), (e) => setMsg(clean(e)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe vb" role="dialog" aria-label="Vault board">
        <header className="sheet-head">
          <div className="sheet-title">Vault board</div>
          <span className="faint">{shown.length} of {notes.length} notes</span>
          <span className="spacer-flex" />
          <button className="ghost small" onClick={importEnex}>Import an Evernote export…</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="vb-bar">
          <label className="chart-name" htmlFor="vb-q">Show</label>
          <input id="vb-q" value={opts.q} spellCheck={false} placeholder="type=task status!=done has:due words" onChange={(e) => setOpts({ ...opts, q: e.target.value })} />
          <label className="chart-name" htmlFor="vb-by">Group by</label>
          <input id="vb-by" className="vb-short" value={opts.by} spellCheck={false} onChange={(e) => setOpts({ ...opts, by: e.target.value })} />
          <label className="chart-name" htmlFor="vb-order">Columns</label>
          <input id="vb-order" value={opts.order} spellCheck={false} onChange={(e) => setOpts({ ...opts, order: e.target.value })} />
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={opts.view === 'board'} onClick={() => setOpts({ ...opts, view: 'board' })}>Board</button>
            <button role="tab" aria-selected={opts.view === 'table'} onClick={() => setOpts({ ...opts, view: 'table' })}>Table</button>
          </div>
        </div>
        {msg && <div className="vb-msg faint">{msg}</div>}
        {opts.view === 'board' ? (
          <div className="vb-board">
            {cols.map((c) => (
              <section key={c.column} className={`vb-col ${drag ? 'drop' : ''}`} onDragOver={(e) => c.column !== '(none)' && e.preventDefault()} onDrop={(e) => (e.preventDefault(), drag && move(drag, c.column), setDrag(null))}>
                <div className="vb-col-head"><span>{c.column}</span><span className="faint">{c.notes.length}</span></div>
                {c.notes.map((n) => (
                  <div key={n.file} className="vb-card" draggable onDragStart={() => setDrag(n.file)} onDragEnd={() => setDrag(null)} title={n.file}>
                    <b>{n.title}</b>
                    <span className="faint">{fields.filter((f) => f !== opts.by && n.data[f]).slice(0, 3).map((f) => `${f}: ${show(n.data[f])}`).join(' · ')}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="vb-table-wrap">
            <table className="tbl vb-table">
              <thead><tr><th>Note</th>{fields.map((f) => <th key={f}>{f}</th>)}</tr></thead>
              <tbody>{shown.map((n) => <tr key={n.file}><td title={n.file}>{n.title}</td>{fields.map((f) => <td key={f}>{show(n.data[f])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
