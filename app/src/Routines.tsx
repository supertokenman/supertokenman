import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { Markdown } from './markdown'
import { DAYS, EVERY, type When } from '../shared/triggers'
import { nextOf, type Draft, type Routine } from '../shared/routines'

const blank = (cwd: string): Partial<Routine> => ({ name: '', cwd, skill: '', params: '', when: { kind: 'schedule', days: [1], time: '09:00' }, enabled: true })

/** Routines: skills on a schedule that only read, and leave a draft here for you. */
export function RoutinesSheet(props: { cwd?: string; onClose: () => void }) {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [busy, setBusy] = useState<string[]>([])
  const [edit, setEdit] = useState<Partial<Routine> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const load = () => void window.stm.rt.state().then((s) => (setRoutines(s.routines), setDrafts(s.drafts), setBusy(s.busy)))
  useEffect(() => (load(), window.stm.rt.onChanged(load)), [])
  const when = edit?.when as When | undefined
  const setWhen = (w: When) => setEdit({ ...edit, when: w })
  const d = drafts.find((x) => x.id === open)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Routines">
        <header className="sheet-head">
          <div className="sheet-title">Routines</div>
          <span className="faint">skills on a schedule; they only read and leave a draft</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ex-grid mf-grid">
          <div className="ex-col">
            {routines.map((r) => {
              const next = nextOf(r, Date.now())
              return (
                <div key={r.id} className="pb-card">
                  <div className="ob-row"><b className="ob-grow">{r.name}</b>{busy.includes(r.id) ? <span className="pb-state running">running</span> : <button className="ghost small" onClick={() => void window.stm.rt.run(r.id).then(load)}>Run now</button>}<button className="ghost small" onClick={() => setEdit(r)}>Edit</button></div>
                  <span className="faint">{r.skill ? `skill ${r.skill} · ` : ''}{r.cwd.split('/').pop()} · {r.enabled && next ? `next ${new Date(next).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'off'}</span>
                </div>
              )
            })}
            {!edit && <div><button onClick={() => setEdit(blank(props.cwd ?? ''))}>New routine</button></div>}
            {edit && (
              <div className="pb-card">
                <input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Weekly dependency check" aria-label="Routine name" />
                <input value={edit.cwd ?? ''} onChange={(e) => setEdit({ ...edit, cwd: e.target.value })} placeholder="/path/to/project" aria-label="Project folder" spellCheck={false} />
                <input value={edit.skill ?? ''} onChange={(e) => setEdit({ ...edit, skill: e.target.value })} placeholder="Skill name (optional)" aria-label="Skill" spellCheck={false} />
                <textarea rows={3} value={edit.params ?? ''} onChange={(e) => setEdit({ ...edit, params: e.target.value })} placeholder="What to look at and what to report" aria-label="What it does" />
                <div className="ob-row">
                  <select className="select" value={when?.kind} onChange={(e) => setWhen(e.target.value === 'every' ? { kind: 'every', minutes: 240 } : { kind: 'schedule', days: [1], time: '09:00' })} aria-label="When">
                    <option value="schedule">On days</option>
                    <option value="every">Every few hours</option>
                  </select>
                  {when?.kind === 'schedule' && (
                    <>
                      {DAYS.map((dn, i) => <label key={dn} className="rt-day"><input type="checkbox" checked={when.days.includes(i)} onChange={(e) => setWhen({ ...when, days: e.target.checked ? [...when.days, i].sort() : when.days.filter((x) => x !== i) })} />{dn}</label>)}
                      <input type="time" value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value })} aria-label="Time" />
                    </>
                  )}
                  {when?.kind === 'every' && (
                    <select className="select" value={when.minutes} onChange={(e) => setWhen({ kind: 'every', minutes: Number(e.target.value) })} aria-label="How often">{EVERY.filter((m) => m >= 60).map((m) => <option key={m} value={m}>every {m / 60} h</option>)}</select>
                  )}
                </div>
                <div className="ob-row">
                  <label className="ca-toggle"><input type="checkbox" checked={Boolean(edit.enabled)} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />On</label>
                  <span className="spacer-flex" />
                  {edit.id && <button className="danger" onClick={() => void window.stm.rt.remove(edit.id!).then(() => (setEdit(null), load()))}>Delete</button>}
                  <button onClick={() => setEdit(null)}>Cancel</button>
                  <button className="primary" onClick={() => void window.stm.rt.save(edit).then(() => (setEdit(null), setErr(''), load()), (e) => setErr(clean(e)))}>Save</button>
                </div>
                {err && <div className="notice error">{err}</div>}
              </div>
            )}
            <div className="faint">A routine can read the project's files and use a skill. It cannot run commands, edit, reach the network or post anywhere; it costs like any turn and counts in the project's budget.</div>
          </div>
          <div className="ex-col">
            <span className="chart-name">Drafts</span>
            {drafts.length === 0 && <div className="faint">Nothing yet.</div>}
            {drafts.map((x) => (
              <button key={x.id} className={`wt-row ${x.id === open ? 'on' : ''} ${x.read ? 'done' : ''}`} onClick={() => (setOpen(x.id), !x.read && void window.stm.rt.read(x.id, true))}>
                <b>{x.read ? '' : '● '}{x.name}</b>
                <span className="faint">{new Date(x.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}{x.costUsd ? ` · US$ ${x.costUsd.toFixed(3)}` : ''}{x.error ? ' · failed' : ''}</span>
              </button>
            ))}
            {d && (
              <div className="rt-draft">
                {d.error ? <div className="notice error">{d.error}</div> : <Markdown text={d.text} />}
                <div className="ob-row"><span className="spacer-flex" /><button onClick={() => void navigator.clipboard.writeText(d.text)}>Copy</button><button className="danger" onClick={() => void window.stm.rt.dropDraft(d.id).then(() => (setOpen(null), load()))}>Delete</button></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
