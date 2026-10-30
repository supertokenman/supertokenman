import { useEffect, useRef, useState } from 'react'
import { Checkbox, Select } from './ui'
import { StateMark } from './StateMark'
import { modelLabel } from '../shared/models'
import type { CardView } from '../shared/qfcwire'

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const left = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const msg = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

/** A turn failed on a limit or an outage: the reason, what the fallback is, and three ways on. Nothing switches until a button does. */
export default function FailoverCard(props: { sid: string; card: CardView }) {
  const { sid, card } = props
  const [always, setAlways] = useState(card.always)
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState('')
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [setting, setSetting] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  // the card appears at the end of the stream: bring it into view above the composer
  useEffect(() => {
    root.current?.scrollIntoView({ block: 'nearest' })
  }, [card.id])
  // the countdown ticks once a second, and not at all while the window is out of focus
  useEffect(() => {
    if (!card.waiting) return
    const t = setInterval(() => {
      if (!document.documentElement.hasAttribute('data-blurred')) setNow(Date.now())
    }, 1000)
    return () => clearInterval(t)
  }, [card.waiting?.until])
  const choose = (choice: 'switch' | 'wait' | 'cancel', confirm?: boolean) => {
    setBusy(true)
    setErr('')
    window.stm.failover.choose(sid, card.id, choice, choice === 'switch' ? always : undefined, confirm).then(
      (ok) => {
        setBusy(false)
        if (!ok && choice === 'switch') setErr('The switch did not happen. See the note in the transcript.')
      },
      (e) => (setBusy(false), setErr(msg(e))),
    )
  }
  const canSwitch = Boolean(card.fallback) && !card.noSwitch
  const retriesLeft = card.waitUntil || card.attempt < card.maxAttempts
  return (
    <div ref={root} className="ask held-card failover-card" role="alert" aria-label="Failover">
      <div className="ask-head">
        <StateMark state="warn" label="Failed" />
        <span className="ask-label">{card.reason}</span>
      </div>
      <p className="held-why">
        The turn did not complete. {card.fallback ? <>Fallback: <b>{card.fallback.label}</b>.</> : 'No fallback is set for this panel.'} Nothing is resent until you choose.
        {card.prompt && <span className="failover-prompt faint"> Prompt: {card.prompt}</span>}
      </p>
      {card.noSwitch && <p className="failover-why faint">{card.noSwitch}{!card.fallback && <> <button className="link" onClick={() => setSetting(!setting)}>Set a fallback</button></>}</p>}
      {setting && <div className="failover-set"><FallbackChip sid={sid} /><span className="faint">Applies from the next failure.</span></div>}
      {confirming && card.confirm && <p className="failover-confirm">{card.confirm}</p>}
      {card.waiting && (
        <p className="failover-wait" role="status">
          Resending at {clock(card.waiting.until)} ({left(card.waiting.until, now)} left){card.attempt > 0 ? `, try ${card.attempt} of ${card.maxAttempts}` : ''}.
        </p>
      )}
      {err && <p className="failover-err" role="alert">{err}</p>}
      {card.fallback && (
        <label className="ca-toggle failover-always" data-tip="Switch without asking next time. A line is still written in the transcript.">
          <Checkbox
            checked={always}
            onChange={(e) => {
              setAlways(e.target.checked)
              void window.stm.failover.prefsSet(sid, { fallback: { model: card.fallback!.model, provider: card.fallback!.provider as 'custom' | undefined }, always: e.target.checked })
            }}
          />
          Always switch for this panel
        </label>
      )}
      <div className="ask-actions">
        <button className="ghost" disabled={busy} onClick={() => choose('cancel')}>Cancel</button>
        <button className="ghost" disabled={busy || !retriesLeft || Boolean(card.waiting)} onClick={() => choose('wait')}>
          {card.waitUntil ? `Wait until ${clock(card.waitUntil)}` : retriesLeft ? 'Wait and retry' : 'No retries left'}
        </button>
        {confirming && card.confirm ? (
          <button className="primary" disabled={busy} onClick={() => choose('switch', true)}>Confirm: send it there</button>
        ) : (
          <button className="primary" disabled={busy || !canSwitch} onClick={() => (card.confirm ? setConfirming(true) : choose('switch'))}>
            {card.fallback ? `Switch to ${card.fallback.label}` : 'Switch'}
          </button>
        )}
      </div>
    </div>
  )
}

/** The panel's fallback: another model, or the custom endpoint already set up. Off until the person picks one. */
export function FallbackChip(props: { sid: string }) {
  const { sid } = props
  const [open, setOpen] = useState(false)
  const [d, setD] = useState<Awaited<ReturnType<typeof window.stm.failover.prefsGet>> | null>(null)
  const [err, setErr] = useState('')
  const load = () => window.stm.failover.prefsGet(sid).then(setD, (e) => setErr(msg(e)))
  useEffect(() => {
    void load()
  }, [sid])
  const fb = d?.prefs.fallback
  const value = fb?.provider === 'custom' ? 'custom' : fb?.model ?? ''
  const label = !fb ? 'off' : fb.provider === 'custom' ? 'custom endpoint' : modelLabel(fb.model ?? '')
  const save = (v: string) => {
    const next = v === '' ? {} : v === 'custom' ? { fallback: { provider: 'custom' as const }, always: d?.prefs.always } : { fallback: { model: v }, always: d?.prefs.always }
    window.stm.failover.prefsSet(sid, next).then(() => load(), (e) => setErr(msg(e)))
  }
  return (
    <span className="fallback-chip">
      <button className="ghost small" aria-expanded={open} data-tip="What to offer when a limit or an outage stops a turn. Never switches without a card unless you tick Always." onClick={() => setOpen(!open)}>
        Fallback: {label}
      </button>
      {open && d && (
        <span className="fallback-set">
          <Select value={value} onChange={(e) => save(e.target.value)} aria-label="Fallback model">
            <option value="">No fallback</option>
            {d.models.map((m) => <option key={m} value={m}>{modelLabel(m)}</option>)}
            <option value="custom" disabled={!d.custom.on}>{d.custom.on ? `Custom endpoint (${d.custom.url})` : 'Custom endpoint (off in settings)'}</option>
          </Select>
          {fb && (
            <label className="ca-toggle">
              <Checkbox checked={Boolean(d.prefs.always)} onChange={(e) => window.stm.failover.prefsSet(sid, { fallback: fb as { model?: string; provider?: 'custom' }, always: e.target.checked }).then(() => load(), (x) => setErr(msg(x)))} />
              Always switch for this panel
            </label>
          )}
          <span className="faint">The custom endpoint is asked about once on the card before the first switch.</span>
          {err && <span className="failover-err">{err}</span>}
        </span>
      )}
    </span>
  )
}
