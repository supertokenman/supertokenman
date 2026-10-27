import { useState } from 'react'
import { IconClose } from './icons'
import type { Change, Team } from '../shared/team'
import { DiffBlock } from './Lab'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'
import { Checkbox } from './ui'

const STATUS: Record<Change['status'], string> = { new: 'New', changed: 'Changed', same: 'Same' }

/**
 * The team as a file: export the personas, triggers, eval cases, answer styles and limits (never
 * secrets, memory or history); import shows each item as new, changed or the same, with what changes,
 * and brings in only the ones ticked.
 */
export function TeamFileSheet(props: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [incoming, setIncoming] = useState<{ team: Team; changes: Change[] } | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const run = async (f: () => Promise<void>) => {
    setMsg(null)
    try {
      await f()
    } catch (e) {
      setMsg({ text: clean(e), bad: true })
    }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet teamfile" role="dialog" aria-label="Team file">
        <header className="sheet-head">
          <div className="sheet-title">Team file</div>
          <span className="faint">Share your setup; secrets, memory and history never go in it.</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="dsg-body">
          {msg && <div className={`notice ${msg.bad ? 'error' : ''}`}>{msg.text}</div>}
          <div className="sp-label">Export</div>
          <div className="dep-row">
            <input id="team-name" value={name} placeholder="Team name, e.g. Shop backend" onChange={(e) => setName(e.target.value)} />
            <button className="primary small" onClick={() => void run(async () => {
              const r = await window.stm.team.exportFile(name)
              if (r) setMsg({ text: `Saved ${r.file}: ${r.personas} persona${r.personas === 1 ? '' : 's'}, ${r.triggers} trigger${r.triggers === 1 ? '' : 's'}, ${r.evals} eval set${r.evals === 1 ? '' : 's'}.${r.dropped.length ? ` Left out because they hold a secret: ${r.dropped.join(', ')}.` : ''} Trigger folders are left out; each person picks their own.` })
            })}>Export…</button>
          </div>
          <div className="sp-label">Import</div>
          <div className="dep-row">
            <span className="faint">Open a .stmteam.json file to see what it would change first.</span>
            <span className="spacer-flex" />
            <button className="ghost small" onClick={() => void run(async () => {
              const r = await window.stm.team.open()
              if (!r) return
              setIncoming(r)
              setPicked(r.changes.filter((c) => c.status === 'new').map((c) => c.key))
            })}>Open…</button>
          </div>
          {incoming && (
            <>
              <div className="sp-label">{incoming.team.name} · {incoming.changes.filter((c) => c.status === 'new').length} new · {incoming.changes.filter((c) => c.status === 'changed').length} changed · {incoming.changes.filter((c) => c.status === 'same').length} the same</div>
              <div className="team-list">
                {incoming.changes.map((c) => (
                  <div key={c.key} className={`team-item ${c.status}`}>
                    <label className="team-row">
                      <Checkbox disabled={c.status === 'same'} checked={picked.includes(c.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.key] : picked.filter((k) => k !== c.key))} />
                      <span className={`team-st ${c.status}`}>{STATUS[c.status]}</span>
                      <b>{c.name}</b>
                      <span className="faint">{c.kind}</span>
                      <span className="spacer-flex" />
                      {c.status !== 'same' && <button className="ghost small" onClick={(e) => (e.preventDefault(), setOpen(open === c.key ? null : c.key))}>{open === c.key ? 'Hide' : c.status === 'changed' ? 'What changes' : 'See it'}</button>}
                    </label>
                    {open === c.key && <DiffBlock before={c.before ?? ''} after={c.after} />}
                  </div>
                ))}
              </div>
              <div className="sbx-actions">
                <span className="faint">Changed personas keep their old instructions under Lab, Versions. Imported triggers start off, without a folder.</span>
                <button className="ghost small" onClick={() => setIncoming(null)}>Cancel</button>
                <button className="primary small" disabled={!picked.length} onClick={() => void run(async () => {
                  const r = await window.stm.team.apply(incoming.team, picked)
                  setIncoming(null)
                  setMsg({ text: `Imported ${picked.length} item${picked.length === 1 ? '' : 's'}. You now have ${r.personas} persona${r.personas === 1 ? '' : 's'} and ${r.triggers} trigger${r.triggers === 1 ? '' : 's'}.` })
                })}><StateMark state="up" label="Import" /> Import {picked.length}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
