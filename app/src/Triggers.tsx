import { pickProjectFolder } from './FolderPicker'
import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { Persona } from '../shared/personas'
import { DAYS, describe, EVERY, nextRun, type Trigger, type When } from '../shared/triggers'
import { clean } from './errors'
import type { Run } from '../shared/runs'
import { Checkbox, Select, TimeField } from './ui'

const ago = (t?: number) => {
  if (!t) return 'Never ran'
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'Ran just now' : m < 60 ? `Ran ${m} min ago` : m < 1440 ? `Ran ${Math.round(m / 60)} h ago` : `Ran ${Math.round(m / 1440)} d ago`
}
const when = (t: number | null) => (t ? new Date(t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '')

/** Triggers: a persona that starts on its own, on a schedule or when a pull request waits on you. */
export function Triggers(props: { cwd: string; onClose: () => void }) {
  const [list, setList] = useState<Trigger[] | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [edit, setEdit] = useState<Trigger | null>(null)
  const [err, setErr] = useState('')
  const [runs, setRuns] = useState<Run[]>([])
  useEffect(() => {
    void window.stm.triggers.list().then(setList)
    void window.stm.triggers.runs().then(setRuns)
    void window.stm.personas.list().then(setPersonas)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (edit ? setEdit(null) : props.onClose())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props, edit])
  const run = async (fn: () => Promise<Trigger[] | void>) => {
    setErr('')
    try {
      const r = await fn()
      if (r) setList(r)
    } catch (e) {
      setErr(clean(e))
    }
  }
  const persona = (id: string) => personas.find((p) => p.id === id)
  const blank = (): Trigger => ({ id: '', name: '', persona: personas[0]?.id ?? '', cwd: props.cwd, prompt: '', when: { kind: 'schedule', days: [1, 2, 3, 4, 5], time: '09:00' }, enabled: true })

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet triggers" role="dialog" aria-label="Triggers">
        <header className="sheet-head">
          <div className="sheet-title">Triggers</div>
          <span className="faint">Personas that start on their own while the app is running.</span>
          <span className="spacer-flex" />
          {!edit && <button className="primary small" onClick={() => setEdit(blank())}>New trigger</button>}
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body">
          {err && <div className="notice error">{err}</div>}
          {edit ? (
            <Editor t={edit} personas={personas} onCancel={() => setEdit(null)} onSave={(t) => void run(async () => { const r = await window.stm.triggers.save(t); setEdit(null); return r })} />
          ) : list?.length === 0 ? (
            <div className="sheet-empty">
              <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="18" className="se-b" /><path d="M28 18v10l7 5" className="se-line" /><path d="M44 10l4 4-4 4" className="se-line" /><circle cx="44" cy="44" r="5" className="se-a" /></svg>
              <div className="se-title">Nothing runs on its own yet</div>
              <div className="se-text">For example: weekdays at 9:00 the DevOps persona checks Cloud and CI and tells you what needs you. Or: when a pull request waits on your review, the Reviewer reads it first.</div>
              <button className="primary small" onClick={() => setEdit(blank())}>New trigger</button>
            </div>
          ) : (
            <div className="trig-list">
              {runs.length > 0 && (
                <div className="trig-runs">
                  <div className="sp-label">Runs that did not finish</div>
                  {runs.map((r) => (
                    <div key={r.id} className="trig-run">
                      <b>{r.name}</b>
                      <span className="faint">{r.state === 'waiting' ? 'waiting for you' : r.state === 'paused' ? 'paused by an error' : 'stopped by a restart'} at step {r.step + 1} of {r.of}</span>
                      <span className="spacer-flex" />
                      <button className="ghost small" onClick={() => { window.dispatchEvent(new CustomEvent('stm:resume-run', { detail: { trigger: r.trigger, run: r.id } })); props.onClose() }}>Resume</button>
                    </div>
                  ))}
                </div>
              )}
              {list?.map((t) => {
                const p = persona(t.persona)
                const next = t.enabled ? nextRun(t.when, Math.max(Date.now(), t.lastRun ?? 0, t.armedAt ?? 0)) : null
                return (
                  <div key={t.id} className={`trig-row ${t.enabled ? '' : 'off'}`} style={{ '--pc': p?.color ?? 'var(--border-strong)' } as React.CSSProperties}>
                    <label className="switch" data-tip={t.enabled ? 'On' : 'Off'} role="img" aria-label={t.enabled ? 'On' : 'Off'}>
                      <Checkbox checked={t.enabled} onChange={(e) => void run(() => window.stm.triggers.save({ ...t, enabled: e.target.checked }))} />
                      <span />
                    </label>
                    <div className="trig-main">
                      <div className="trig-top">
                        <span className="trig-name">{t.name}</span>
                        {p && <span className="persona-chip">{p.name}</span>}
                      </div>
                      <div className="trig-when">
                        {describe(t.when)}
                        {next ? <span className="faint"> · next {when(next)}</span> : null}
                        <span className="faint"> · {ago(t.lastRun)}</span>
                      </div>
                      <div className="trig-prompt">{t.prompt}</div>
                    </div>
                    <div className="trig-actions">
                      <button className="ghost small" onClick={() => void run(() => window.stm.triggers.run(t.id))}>Run now</button>
                      <button className="ghost small" onClick={() => setEdit(t)}>Edit</button>
                      <button className="ghost small pcard-del" onClick={() => void run(() => window.stm.triggers.remove(t.id))}>Delete</button>
                    </div>
                  </div>
                )
              })}
              <div className="faint trig-note">Each run opens a panel. Anything that edits files or runs commands still asks you first, so a trigger never acts unseen.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Editor(props: { t: Trigger; personas: Persona[]; onSave: (t: Trigger) => void; onCancel: () => void }) {
  const [t, setT] = useState(props.t)
  const set = (p: Partial<Trigger>) => setT({ ...t, ...p })
  const setWhen = (w: When) => set({ when: w })
  const days = t.when.kind === 'schedule' ? t.when.days : []
  return (
    <div className="persona-edit">
      <div className="pe-row">
        <input className="pe-name" placeholder="Name, e.g. Morning check" value={t.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        <Select value={t.persona} onChange={(e) => set({ persona: e.target.value })} aria-label="Persona">
          <option value="">No persona</option>
          {props.personas.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <div className="trig-folder">
        <span className="faint">Folder</span>
        <code>{t.cwd || 'the focused panel’s folder'}</code>
        <button className="ghost small" onClick={() => void pickProjectFolder('Folder the trigger runs in').then((f) => f && set({ cwd: f }))}>Change</button>
      </div>
      <label className="trig-gate">
        <Checkbox checked={t.gate === true} onChange={(e) => set({ gate: e.target.checked })} />
        Ask me before it starts
        <span className="faint">Split the work into steps with a line holding only ---. A step that starts with [ask] waits for your go.</span>
      </label>
      <label className="trig-gate">
        <Checkbox checked={t.hoursOnly === true} onChange={(e) => set({ hoursOnly: e.target.checked })} />
        Only in business hours
        <span className="faint">Waits until the hours set in the Inbox open; Run now still runs at once.</span>
      </label>
      <label className="trig-gate">
        <Checkbox checked={t.webhook === true} onChange={(e) => set({ webhook: e.target.checked })} />
        Start from a local webhook
        <span className="faint">Listens on 127.0.0.1 only, never beyond this Mac. The request body reaches the run marked as untrusted data.</span>
      </label>
      {t.webhook && <Hook id={t.id} />}
      <div className="trig-scope">
        <span className="trig-scope-title">Limits for this run</span>
        <span className="faint">One per line or comma. Folders are relative to the project. Empty means no limit of that kind; anything outside a limit is refused, not asked.</span>
        {([
          ['read', 'May read', 'docs, src'],
          ['write', 'May write', 'src'],
          ['commands', 'May run', 'npm test, git status'],
        ] as const).map(([k, label, ph]) => (
          <label key={k} className="trig-scope-row">
            <span>{label}</span>
            <input
              className="trig-scope-input"
              placeholder={ph}
              value={(t.scope?.[k] ?? []).join(', ')}
              onChange={(e) => {
                const v = e.target.value.split(/[,\n]/).map((x) => x.trim())
                set({ scope: { read: t.scope?.read ?? [], write: t.scope?.write ?? [], commands: t.scope?.commands ?? [], [k]: e.target.value.trim() ? v : [] } })
              }}
            />
          </label>
        ))}
      </div>
      <textarea className="pe-text trig-text" placeholder="What to do each time, e.g. Check Cloud and the CI of this repo and list what needs me today. Do not change anything." value={t.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      <div className="trig-when-edit">
        <div className="segmented">
          <button aria-selected={t.when.kind === 'schedule'} onClick={() => setWhen({ kind: 'schedule', days: [1, 2, 3, 4, 5], time: '09:00' })}>Schedule</button>
          <button aria-selected={t.when.kind === 'every'} onClick={() => setWhen({ kind: 'every', minutes: 60 })}>Every</button>
          <button aria-selected={t.when.kind === 'pr-review'} onClick={() => setWhen({ kind: 'pr-review' })}>PR to review</button>
        </div>
        {t.when.kind === 'schedule' && (
          <>
            <div className="trig-days">
              {DAYS.map((d, i) => (
                <button key={d} className={`trig-day ${days.includes(i) ? 'on' : ''}`} aria-pressed={days.includes(i)} onClick={() => setWhen({ kind: 'schedule', time: (t.when as { time: string }).time, days: days.includes(i) ? days.filter((x) => x !== i) : [...days, i] })}>
                  {d.slice(0, 2)}
                </button>
              ))}
            </div>
            <TimeField className="trig-time" value={t.when.time} onChange={(e) => setWhen({ kind: 'schedule', days, time: e.target.value })} />
          </>
        )}
        {t.when.kind === 'every' && (
          <Select value={t.when.minutes} onChange={(e) => setWhen({ kind: 'every', minutes: Number(e.target.value) })}>
            {EVERY.map((m) => (
              <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>
            ))}
          </Select>
        )}
        {t.when.kind === 'pr-review' && <span className="faint">Checks GitHub every 5 minutes; the pull request is added to the prompt.</span>}
      </div>
      <div className="pe-foot">
        <button className="ghost small" onClick={props.onCancel}>Cancel</button>
        <button className="primary small" disabled={!t.name.trim() || !t.prompt.trim() || (t.when.kind === 'schedule' && !days.length)} onClick={() => props.onSave(t)}>Save</button>
      </div>
    </div>
  )
}

function Hook(props: { id: string }) {
  const [h, setH] = useState<{ curl: string; listening: boolean } | null | undefined>(undefined)
  useEffect(() => void window.stm.triggers.webhook(props.id).then(setH, () => setH(null)), [props.id])
  if (h === undefined) return null
  if (!h || !h.listening) return <span className="faint">Save to get the curl line.</span>
  return (
    <div className="trig-hook">
      <code>{h.curl}</code>
      <button className="ghost small" onClick={() => void navigator.clipboard.writeText(h.curl).catch(() => undefined)}>Copy</button>
    </div>
  )
}
