import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { QuotaState } from './bridge'
import { confirmsFor, headroom, type Source, type Window } from '../shared/quotapolicy'
import { clean } from './errors'
import { Radio } from './ui'

const LABEL: Record<Source, string> = { setup: 'As set up', plan: 'Plan only', api: 'Paid API', custom: 'Custom endpoint' }
const WHAT: Record<Source, string> = {
  setup: 'Whatever this machine is set up with: the Claude login, or a key in the environment.',
  plan: 'The Claude plan only. When its limit is reached the panel pauses and tells you; it never moves to a paid source.',
  api: 'The ANTHROPIC_API_KEY in the vault, through the app\'s local gateway: the panel gets a token, never the key. Billed per token.',
  custom: 'An endpoint you run. Your prompts and replies pass through it.',
}

/** Phase 88: the source this panel may bill, with the tightest limit window as an estimate. */
export function SourceChip(props: { sid: string; limits: Record<string, { percentUsed: number; resetsAt?: string }>; refresh: number; onNote: (t: string) => void }) {
  const [st, setSt] = useState<QuotaState | null>(null)
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState<Source>('setup')
  const [confirms, setConfirms] = useState(0)
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState({ top: 0, left: 0 })
  useEffect(() => void window.stm.billSource.get(props.sid).then(setSt, () => {}), [props.sid, props.refresh])
  if (!st) return null
  const room = headroom(Object.entries(props.limits).map(([kind, w]) => ({ kind, ...w }) as Window))
  const need = confirmsFor(st.source, to)
  const act = (p: Promise<QuotaState>) => {
    setBusy(true)
    void p.then((s) => (setSt(s), setOpen(false)), (e) => props.onNote(clean(e))).finally(() => setBusy(false))
  }
  return (
    <span className="iso-wrap">
      <button className={`ghost small iso-chip src-chip ${st.paused ? 'held' : st.source !== 'setup' ? 'on' : ''}`} data-tip="Which source this panel may bill" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setAt({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 336) })
        setTo(st.source); setConfirms(0); setOpen(!open)
      }}>
        {st.paused ? 'Paused · plan limit' : LABEL[st.source]}
        {room && <span className={`src-room ${room.level}`} aria-label={`${room.percent}% of the ${room.kind} limit used`}><i style={{ width: `${room.percent}%` }} /></span>}
      </button>
      {open && createPortal(
        <div className="iso-pop" role="dialog" aria-label="Source" style={{ top: at.top, left: at.left }}>
          {room && <div className="faint">About {room.percent}% of the {room.kind.replace(/_/g, ' ')} limit used{room.resetsAt ? `, resets ${new Date(room.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}. An estimate from the API; the plan's exact limits are not published.</div>}
          {st.paused && <div className="src-warn">The plan limit was reached. Nothing was sent anywhere else.</div>}
          {(['setup', 'plan', 'api', 'custom'] as Source[]).map((s) => (
            <label key={s} className="ca-toggle src-opt">
              <Radio name="src" checked={to === s} disabled={(s === 'api' && !st.hasKey) || (s === 'custom' && !st.customOn)} onChange={() => (setTo(s), setConfirms(0))} />
              <span><b>{LABEL[s]}</b><span className="faint"> {s === 'custom' && st.customUrl ? `${st.customUrl}. ` : ''}{WHAT[s]}{s === 'api' && !st.hasKey ? ' Add the key to the vault first.' : ''}{s === 'custom' && !st.customOn ? ' Off: turn it on in Settings.' : ''}</span></span>
            </label>
          ))}
          {need > 0 && confirms > 0 && <div className="src-warn">{to === 'custom' ? `Your plan traffic and prompts will pass through ${st.customUrl}. Confirm again to switch.` : `Switch to ${LABEL[to]} from the next message?`}</div>}
          <div className="ob-row">
            {st.paused && <button disabled={busy} onClick={() => act(window.stm.billSource.resume(props.sid))}>Resume on the plan</button>}
            <span className="spacer-flex" />
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" disabled={busy || need === 0} onClick={() => (confirms + 1 >= need + 1 ? act(window.stm.billSource.set(props.sid, to, confirms)) : setConfirms(confirms + 1))}>
              {confirms === 0 ? 'Switch' : 'Confirm'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </span>
  )
}
