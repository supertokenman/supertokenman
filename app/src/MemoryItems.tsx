import { useEffect, useState } from 'react'
import { IconClose, IconEdit, IconArchive } from './icons'
import { RowAct, RowActs } from './RowActs'
import type { Hit, MemItem, Origin } from '../shared/memitems'

const ORIGINS: [Origin, string][] = [['you', 'You'], ['agent', 'Claude'], ['session', 'A session']]

/** Memory: facts and decisions that are only ever added; edits are new versions, nothing is overwritten. */
export function MemoryItemsSheet(props: { project: string; onClose: () => void }) {
  const [mode, setMode] = useState<'now' | 'history'>('now')
  const [items, setItems] = useState<MemItem[]>([])
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [origins, setOrigins] = useState<Origin[]>([])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [chain, setChain] = useState<MemItem[] | null>(null)
  const load = () => void window.stm.mi.list(props.project, mode).then(setItems)
  useEffect(() => (load(), window.stm.mi.onChanged(load)), [mode, props.project])
  useEffect(() => {
    if (!q.trim()) return setHits(null)
    const t = setTimeout(() => void window.stm.mi.search(props.project, q, mode, origins).then(setHits), 250)
    return () => clearTimeout(t)
  }, [q, mode, origins, items])
  const shown = hits ? hits.map((h) => ({ item: h.item, via: h.via })) : items.filter((x) => !origins.length || origins.includes(x.origin)).map((item) => ({ item, via: [] as string[] }))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe ${shown.length ? "" : "fit"}`} role="dialog" aria-label="Memory items">
        <header className="sheet-head">
          <div className="sheet-title">Memory</div>
          <span className="faint">{props.project || 'all projects'} · nothing is overwritten</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <div className="ob-row">
            <div className="segmented" role="tablist">
              <button role="tab" aria-selected={mode === 'now'} onClick={() => setMode('now')}>Now</button>
              <button role="tab" aria-selected={mode === 'history'} onClick={() => setMode('history')}>History</button>
            </div>
            <input className="ob-grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by words, meaning, files or packages" aria-label="Search memory" />
            {ORIGINS.map(([o, label]) => <label key={o} className="rt-day"><input type="checkbox" checked={origins.includes(o)} onChange={(e) => setOrigins(e.target.checked ? [...origins, o] : origins.filter((x) => x !== o))} />{label}</label>)}
          </div>
          <div className="ob-row">
            <input className="ob-grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a fact or decision (e.g. Tests run with vitest; slow ones are tagged)" aria-label="New memory item" />
            <button className="primary" disabled={!draft.trim()} onClick={() => void window.stm.mi.add(props.project, draft, 'you').then(() => setDraft(''))}>Add</button>
          </div>
          <ol className="mi-list">
            {shown.map(({ item, via }) => (
              <li key={item.id} className={`mi-item ${item.archived ? 'archived' : ''} ${item.supersedes ? 'version' : ''}`}>
                {editing?.id === item.id ? (
                  <div className="ob-row">
                    <input className="ob-grow" value={editing.text} onChange={(e) => setEditing({ id: item.id, text: e.target.value })} aria-label="New version" />
                    <button className="primary small" onClick={() => void window.stm.mi.edit(item.id, editing.text).then(() => setEditing(null))}>Save as new version</button>
                    <button className="ghost small" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="mi-text">{item.text}</div>
                )}
                <div className="mi-meta faint">
                  <span className={`mi-origin ${item.origin}`}>{ORIGINS.find(([o]) => o === item.origin)?.[1]}</span>
                  <span>{new Date(item.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {item.supersedes && <button className="ghost small" onClick={() => void window.stm.mi.chain(item.id).then(setChain)}>versions</button>}
                  {via.length > 0 && <span>found by {via.join(' + ')}</span>}
                  {item.entities.slice(0, 4).map((e) => <code key={e}>{e}</code>)}
                  <span className="spacer-flex" />
                  <RowActs>
                    {!editing && <RowAct label="Edit: saves a new version" icon={<IconEdit />} onClick={() => setEditing({ id: item.id, text: item.text })} />}
                    <RowAct label={item.archived ? 'Unarchive' : 'Archive'} icon={<IconArchive />} onClick={() => void window.stm.mi.archive(item.id, !item.archived)} />
                  </RowActs>
                </div>
              </li>
            ))}
          </ol>
          {shown.length === 0 && <div className="faint">{q ? 'Nothing found.' : 'No memory items yet.'}</div>}
          {chain && (
            <div className="rt-draft">
              <div className="ob-row"><span className="chart-name ob-grow">Versions, oldest first</span><button className="icon" aria-label="Close versions" onClick={() => setChain(null)}><IconClose /></button></div>
              <ol className="mi-chain">{chain.map((c) => <li key={c.id}><span className="faint">{new Date(c.at).toLocaleString()}</span> {c.text}</li>)}</ol>
            </div>
          )}
          <div className="faint">Only things about the project: files, packages, commands, decisions. Never notes about people.</div>
        </div>
      </div>
    </div>
  )
}
