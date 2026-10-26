import { useEffect, useState } from 'react'
import type { Slot, SlotRules } from '../shared/slots'
import type { Booking, BookingRequest } from './bridge'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconCalendar, IconCheck, IconClose, IconDeploy, IconExternal, IconRefresh } from './icons'
import './bridge'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fresh = (): Omit<Booking, 'url' | 'publishedAt'> => ({ account: '', name: 'book-me', title: 'Talk with me', who: '', rules: { days: 14, from: '09:00', to: '17:00', minutes: 30, buffer: 10, weekdays: [1, 2, 3, 4, 5], notBeforeHours: 12 } })

/**
 * Scheduling links: free times from the calendars already connected, a booking page on your own
 * Cloudflare Worker (publishing it is a deploy: a click and a confirm), and the requests people send,
 * which you accept or decline here.
 */
export function BookingSheet(props: { onClose: () => void }) {
  const [b, setB] = useState<Omit<Booking, 'url' | 'publishedAt'>>(fresh())
  const [saved, setSaved] = useState<Booking | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [reqs, setReqs] = useState<BookingRequest[] | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => void window.stm.book.get().then((x) => x && (setSaved(x), setB({ account: x.account, name: x.name, title: x.title, who: x.who, rules: x.rules }))), [])
  const loadReqs = () => saved?.url && void window.stm.book.requests().then(setReqs, (e) => setErr(clean(e)))
  useEffect(() => void loadReqs(), [saved?.url])
  const run = async (k: string, f: () => Promise<void>) => {
    setBusy(k)
    setErr('')
    setMsg('')
    try {
      await f()
    } catch (e) {
      setErr(clean(e))
    }
    setBusy('')
  }
  const R = (o: Partial<SlotRules>) => setB({ ...b, rules: { ...b.rules, ...o } })
  const byDay = (slots ?? []).reduce<Record<string, Slot[]>>((m, s) => ((m[new Date(s.start).toDateString()] ??= []).push(s), m), {})
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe bk" role="dialog" aria-label="Scheduling link">
        <header className="sheet-head">
          <div className="sheet-title">Scheduling link</div>
          <span className="faint">{saved?.url ? `Live at ${saved.url}` : 'Not published'}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <div className="fld-grid">
            <label className="fld"><span className="fld-label">Page title</span><input value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} /></label>
            <label className="fld"><span className="fld-label">Your name on it</span><input value={b.who} onChange={(e) => setB({ ...b, who: e.target.value })} /></label>
            <label className="fld"><span className="fld-label">Length (min)</span><input type="number" min={10} step={5} value={b.rules.minutes} onChange={(e) => R({ minutes: Number(e.target.value) || 30 })} /></label>
            <label className="fld"><span className="fld-label">Buffer (min)</span><input type="number" min={0} step={5} value={b.rules.buffer} onChange={(e) => R({ buffer: Number(e.target.value) || 0 })} /></label>
            <label className="fld"><span className="fld-label">From</span><input type="time" value={b.rules.from} onChange={(e) => R({ from: e.target.value })} /></label>
            <label className="fld"><span className="fld-label">To</span><input type="time" value={b.rules.to} onChange={(e) => R({ to: e.target.value })} /></label>
            <label className="fld"><span className="fld-label">Days ahead</span><input type="number" min={1} max={60} value={b.rules.days} onChange={(e) => R({ days: Number(e.target.value) || 14 })} /></label>
            <label className="fld"><span className="fld-label">Notice (hours)</span><input type="number" min={0} value={b.rules.notBeforeHours} onChange={(e) => R({ notBeforeHours: Number(e.target.value) || 0 })} /></label>
            <div className="fld wide"><span className="fld-label">Weekdays</span><div className="ds-row">{DAYS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={b.rules.weekdays.includes(i)} onChange={(e) => R({ weekdays: e.target.checked ? [...b.rules.weekdays, i].sort() : b.rules.weekdays.filter((x) => x !== i) })} /> {d}</label>)}</div></div>
            <label className="fld"><span className="fld-label">Cloudflare account id</span><input value={b.account} placeholder="32 hex characters" onChange={(e) => setB({ ...b, account: e.target.value.trim() })} /></label>
            <label className="fld"><span className="fld-label">Worker name</span><input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value.trim().toLowerCase() })} /><span className="fld-help">Needs CLOUDFLARE_API_TOKEN in the vault.</span></label>
          </div>
          <div className="ob-row">
            <button className="small" disabled={!!busy} onClick={() => void run('preview', async () => { setSaved(await window.stm.book.save(b)); setSlots(await window.stm.book.preview()) })}>{busy === 'preview' ? <StateMark state="busy" label="Reading" /> : <IconCalendar />}Save and show free times</button>
            <span className="spacer-flex" />
            {confirm ? (
              <>
                <button className="ghost small" onClick={() => setConfirm(false)}>Cancel</button>
                <button className="primary small" disabled={!!busy} onClick={() => void run('publish', async () => { const r = await window.stm.book.publish(); setSaved(await window.stm.book.get()); setMsg(`Published ${r.slots} free times at ${r.url}.`); setConfirm(false) })}>{busy === 'publish' ? <StateMark state="busy" label="Publishing" /> : <IconDeploy />}Publish to Cloudflare</button>
              </>
            ) : <button className="primary small" disabled={!slots || !!busy} onClick={() => setConfirm(true)}><IconDeploy />Publish…</button>}
          </div>
          {confirm && <div className="notice">This uploads the Worker "{b.name}" to your Cloudflare account with the {slots?.length ?? 0} free times below, and turns on its workers.dev address. Anyone with the link can see the times and send a request; only your token reads them.</div>}
          {err && <div className="notice error">{err}</div>}
          {msg && <div className="notice">{msg}</div>}
          {slots && (
            <div className="bk-days">
              {!slots.length && <div className="faint">No free times with these rules.</div>}
              {Object.entries(byDay).map(([d, list]) => <div key={d} className="bk-day"><span className="chart-name">{d}</span><span>{list.map((s) => new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).join('  ')}</span></div>)}
            </div>
          )}
          {saved?.url && (
            <>
              <div className="ob-row"><span className="ds-h">Requests</span><span className="spacer-flex" /><a className="is-link" href={saved.url} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(saved.url!))}><IconExternal />Open the page</a><button className="ghost small" onClick={() => loadReqs()}><IconRefresh />Refresh</button></div>
              {reqs && !reqs.length && <div className="faint">No requests yet.</div>}
              {reqs?.map((r) => (
                <div key={r.id} className={`bk-req ${r.status}`}>
                  <b>{new Date(r.slot).toLocaleString([], { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
                  <span>{r.name} · {r.email}</span>
                  {r.note && <span className="faint">{r.note}</span>}
                  <span className="spacer-flex" />
                  {r.status === 'pending' ? (
                    <>
                      <button className="ghost small" onClick={() => void window.stm.book.decide(r.id, 'declined').then(() => loadReqs(), (e) => setErr(clean(e)))}>Decline</button>
                      <button className="primary small" onClick={() => void window.stm.book.decide(r.id, 'accepted').then(() => loadReqs(), (e) => setErr(clean(e)))}><IconCheck />Accept</button>
                    </>
                  ) : <span className={`ar-status ${r.status === 'accepted' ? 'accepted' : 'rejected'}`}>{r.status}</span>}
                </div>
              ))}
              <div className="faint">Accepting marks the time taken on the page; send the invite from your calendar.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
