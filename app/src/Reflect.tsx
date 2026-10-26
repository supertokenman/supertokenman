import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import type { Clash, Item } from '../shared/reflect'

type Pending = Awaited<ReturnType<typeof window.stm.reflect.list>>['pending'][number]
type Draft = Awaited<ReturnType<typeof window.stm.reflect.draft>>
type Pick = { on: boolean; replace: boolean }

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** Phase 120: finished sessions to review; a draft of what to keep, approved item by item, with contradictions side by side. */
export function Reflect(props: { onClose: () => void }) {
  const [pending, setPending] = useState<Pending[]>([])
  const [local, setLocal] = useState<string | null>(null)
  const [vault, setVault] = useState(true)
  const [sel, setSel] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')
  const load = () => void window.stm.reflect.list().then((r) => (setPending(r.pending), setLocal(r.local), setVault(r.vault), !sel && r.pending[0] && setSel(r.pending[0].id)), (e) => setErr(clean(e)))
  useEffect(load, [])
  const cur = pending.find((p) => p.id === sel)
  const make = () => {
    setBusy('draft'), setErr(''), setDone('')
    void window.stm.reflect.draft(sel).then((d) => (setDraft(d), setPicks(d.items.map((x) => ({ on: x.item.confidence !== 'low', replace: x.clashes.length > 0 }))), setBusy('')), (e) => (setErr(clean(e)), setBusy('')))
  }
  const keep = () => {
    if (!draft) return
    setBusy('keep')
    const chosen = draft.items.flatMap((x, i) => (picks[i]?.on ? [{ item: x.item, replace: picks[i]!.replace }] : []))
    void window.stm.reflect.keep(sel, chosen).then((n) => (setDone(`Kept ${n} in ${draft.project}'s memory.`), setDraft(null), setSel(''), setBusy(''), load()), (e) => (setErr(clean(e)), setBusy('')))
  }
  const dismiss = (id: string) => void window.stm.reflect.dismiss(id).then(() => (id === sel && (setSel(''), setDraft(null)), load()))
  const set = (i: number, p: Partial<Pick>) => setPicks((ps) => ps.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const n = picks.filter((p) => p.on).length

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config rf" role="dialog" aria-label="Session review">
        <header className="sheet-head">
          <div className="sheet-title">Session review</div>
          <span className="faint">what a finished session settled; nothing enters the memory without your click</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="rf-body">
          <nav className="rf-list" aria-label="Sessions">
            <div className="sp-label">To review</div>
            {pending.length === 0 && <div className="faint rf-empty">Closed and sleeping panels show here.</div>}
            {pending.map((p) => (
              <div key={p.id} className={`rf-item ${p.id === sel ? 'on' : ''}`}>
                <button onClick={() => (setSel(p.id), setDraft(null), setDone(''))}>
                  <span className="rf-proj">{p.project}</span>
                  <span className="faint">{p.turns} request{p.turns === 1 ? '' : 's'} · {ago(p.at)}</span>
                </button>
                <button className="att-x" aria-label={`Skip ${p.project}`} title="Skip this one" onClick={() => dismiss(p.id)}>×</button>
              </div>
            ))}
          </nav>
          <section className="rf-main">
            {!vault && <div className="faint">No memory vault yet: set one up in Memory first.</div>}
            {done && <div className="rf-done">{done}</div>}
            {cur && !draft && (
              <div className="rf-start">
                <div className="rf-q">Draft what is worth keeping from <b>{cur.project}</b>?</div>
                <div className="faint">Decisions, project facts and lessons, each with a date and a confidence. {local ? <>Drafted by your local model <code>{local}</code>, free; by Haiku if it does not answer, with the cost shown.</> : <>Drafted by Haiku on your plan or key; the cost shows after.</>} Nothing about people.</div>
                <button className="primary" disabled={busy === 'draft' || !vault} onClick={make}>{busy === 'draft' ? 'Drafting…' : 'Draft it'}</button>
              </div>
            )}
            {draft && (
              <>
                <div className="rf-head">
                  <span className="sp-label">{draft.items.length} found in {draft.project}</span>
                  <span className="faint">{draft.via === 'local' ? 'local model, free' : `Haiku, $${draft.costUsd.toFixed(4)}`}</span>
                </div>
                {draft.items.length === 0 && <div className="faint">Nothing worth keeping was found.</div>}
                {draft.items.map((x, i) => <Row key={i} item={x.item} clashes={x.clashes} pick={picks[i]!} onPick={(p) => set(i, p)} />)}
                <div className="rf-acts">
                  <span className="faint">Kept items go to the project's note with today's date. Replacing adds a new entry that names the old one; the old one stays.</span>
                  <button onClick={() => setDraft(null)}>Back</button>
                  <button className="primary" disabled={!n || busy === 'keep'} onClick={keep}>{n ? `Keep ${n}` : 'Pick some'}</button>
                </div>
              </>
            )}
            {err && <div className="bg-err">{err}</div>}
          </section>
        </div>
      </div>
    </div>
  )
}

function Row(props: { item: Item; clashes: Clash[]; pick: Pick; onPick: (p: Partial<Pick>) => void }) {
  const { item, clashes, pick } = props
  return (
    <div className={`rf-row ${pick.on ? 'on' : ''} ${clashes.length ? 'clash' : ''}`}>
      <label className="rf-line">
        <input type="checkbox" checked={pick.on} onChange={(e) => props.onPick({ on: e.target.checked })} />
        <span className={`rf-kind ${item.kind}`}>{item.kind}</span>
        <span className="rf-text">{item.text}</span>
        <span className={`rf-conf ${item.confidence}`}>{item.confidence}</span>
      </label>
      {item.why && <div className="rf-why faint">Why: {item.why}</div>}
      {clashes.map((c) => (
        <div key={c.topic} className="rf-clash">
          <div className="rf-clash-tag">CONTRADICTS · {c.topic}</div>
          <div className="rf-sides">
            <div><span className="rf-side">BEFORE · {c.old.date}</span><span>{c.old.title}</span></div>
            <div><span className="rf-side">NOW</span><span>{item.text}</span></div>
          </div>
          <label className="rf-replace"><input type="checkbox" checked={pick.replace} disabled={!pick.on} onChange={(e) => props.onPick({ replace: e.target.checked })} /> Mark it as replacing the old one</label>
        </div>
      ))}
    </div>
  )
}
