import { useCallback, useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { nextUp, type Event } from '../electron/calendar'

const dayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const hm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/** Where a join link opens: Meet and Teams in the Apps drawer, the rest in the browser. */
export function join(url: string) {
  const app = /meet\.google\.com/.test(url) ? 'meet' : /teams\.(microsoft|live)\.com/.test(url) ? 'teams' : null
  if (app) window.dispatchEvent(new CustomEvent('stm:webapp', { detail: { app, url } }))
  else void window.stm.openUrl(url)
}

/** Today and tomorrow, refreshed every 5 minutes; a notice two minutes before each meeting. */
export function useAgenda() {
  const [events, setEvents] = useState<Event[]>([])
  const [errors, setErrors] = useState<{ calendar: string; error: string }[]>([])
  const [calendars, setCalendars] = useState<string[]>([])
  const [now, setNow] = useState(() => new Date())
  const warned = useRef(new Set<string>())
  const refresh = useCallback(async () => {
    const cals = await window.stm.calendar.list()
    setCalendars(cals)
    if (!cals.length) return setEvents([])
    const from = dayStart()
    const to = new Date(from.getTime() + 2 * 86_400_000)
    const r = await window.stm.calendar.events(from.toISOString(), to.toISOString())
    setEvents([...r.events].sort((a, b) => a.start.localeCompare(b.start)))
    setErrors(r.errors)
  }, [])
  useEffect(() => {
    void refresh().catch(() => undefined)
    const a = setInterval(() => void refresh().catch(() => undefined), 5 * 60_000)
    // keeps ticking while hidden: the notice before a meeting must still fire
    // what it shows is in minutes: a new render only when the minute changes
    const b = setInterval(() => setNow((d) => (Math.floor(d.getTime() / 60_000) === Math.floor(Date.now() / 60_000) ? d : new Date())), 20_000)
    return () => {
      clearInterval(a)
      clearInterval(b)
    }
  }, [refresh])
  const next = nextUp(events, now)
  useEffect(() => {
    if (!next || next.inMin > 2 || next.inMin < 0 || warned.current.has(next.event.id)) return
    warned.current.add(next.event.id)
    try {
      const n = new Notification(next.event.title, { body: `Starts at ${hm(next.event.start)}${next.event.join ? '. Click to join.' : ''}`, silent: false })
      if (next.event.join) n.onclick = () => join(next.event.join!)
    } catch {
      // notifications off
    }
  }, [next])
  return { events, errors, calendars, next, now, refresh }
}

/** The next meeting in the top bar: a countdown, red when it is about to start, and Join. */
export function NextChip({ agenda, onOpen }: { agenda: ReturnType<typeof useAgenda>; onOpen: () => void }) {
  const n = agenda.next
  if (!n || n.inMin > 120) return null
  const soon = n.inMin <= 5
  return (
    <span className={`next-chip ${soon ? 'soon' : ''} ${n.inMin <= 0 ? 'live' : ''}`}>
      <button className="ghost next-main" onClick={onOpen} data-tip={`${n.event.title} at ${hm(n.event.start)}`}>
        <span className="next-dot" />
        <span className="next-title">{n.event.title}</span>
        <span className="next-in">{n.inMin <= 0 ? 'now' : n.inMin < 60 ? `${n.inMin}m` : `${Math.floor(n.inMin / 60)}h${String(n.inMin % 60).padStart(2, '0')}`}</span>
      </button>
      {n.event.join && soon && <button className="small primary" onClick={() => join(n.event.join!)}>Join</button>}
    </span>
  )
}

const PX = 52

export function AgendaSheet({ agenda, onClose }: { agenda: ReturnType<typeof useAgenda>; onClose: () => void }) {
  const [day, setDay] = useState(0)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    const el = scroll.current?.querySelector('.ag-now, .ag-event:not(.past)') as HTMLElement | null
    if (el) scroll.current?.scrollTo({ top: Math.max(0, el.offsetTop - PX) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = new Date(dayStart().getTime() + day * 86_400_000)
  const end = new Date(start.getTime() + 86_400_000)
  const todays = agenda.events.filter((e) => Date.parse(e.start) < end.getTime() && Date.parse(e.end) > start.getTime())
  const allDay = todays.filter((e) => e.allDay)
  const timed = todays.filter((e) => !e.allDay)
  // the day runs 7 to 22, stretched to fit anything earlier or later
  const hours = timed.flatMap((e) => [(Date.parse(e.start) - start.getTime()) / 3_600_000, (Date.parse(e.end) - start.getTime()) / 3_600_000])
  const H0 = Math.max(0, Math.min(7, Math.floor(Math.min(24, ...hours))))
  const H1 = Math.min(24, Math.max(22, Math.ceil(Math.max(0, ...hours))))
  const y = (iso: string) => ((new Date(iso).getTime() - start.getTime()) / 3_600_000 - H0) * PX
  const nowY = ((agenda.now.getTime() - start.getTime()) / 3_600_000 - H0) * PX
  // side by side when two meetings overlap
  const lanes = timed.map((e, i) => timed.slice(0, i).filter((o) => Date.parse(o.end) > Date.parse(e.start)).length)
  const shared = timed.map((e, i) => lanes[i]! > 0 || timed.some((o, j) => j > i && Date.parse(o.start) < Date.parse(e.end)))
  const busy = timed.reduce((m, e) => m + (Date.parse(e.end) - Date.parse(e.start)) / 60000, 0)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet agenda" role="dialog" aria-label="Agenda">
        <header className="sheet-head">
          <div className="sheet-title">Agenda</div>
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={day === 0} onClick={() => setDay(0)}>Today</button>
            <button role="tab" aria-selected={day === 1} onClick={() => setDay(1)}>Tomorrow</button>
          </div>
          {agenda.calendars.length > 0 && (
            <span className="ag-load" data-tip={`${Math.round(busy)} min in meetings`} role="img" aria-label={`${Math.round(busy)} min in meetings`}>
              <span style={{ width: `${Math.min(100, (busy / 480) * 100)}%` }} />
            </span>
          )}
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="ag-body">
          {agenda.calendars.length === 0 ? (
            <div className="ag-empty">
              <svg viewBox="0 0 220 80" aria-hidden="true"><rect x="10" y="10" width="60" height="60" rx="8" className="a" /><path d="M80 40h50" className="l" /><path d="M140 40h40M170 30l10 10-10 10" className="l" /><circle cx="198" cy="40" r="12" className="b" /></svg>
              <b>Connect a calendar with its secret address</b>
              <span className="faint">Google Calendar: Settings, your calendar, "Secret address in iCal format". Outlook: Settings, Calendar, Shared calendars, Publish, ICS link. Free, read-only, kept in the vault.</span>
            </div>
          ) : (
            <>
              {allDay.length > 0 && <div className="ag-allday">{allDay.map((e) => <span key={e.id} className="ag-pill">{e.title}</span>)}</div>}
              <div className="ag-scroll" ref={scroll}>
                <div className="ag-grid" style={{ height: (H1 - H0) * PX }}>
                  {Array.from({ length: H1 - H0 }, (_, i) => (
                    <div key={i} className="ag-hour" style={{ top: i * PX }}><span>{String(H0 + i).padStart(2, '0')}</span></div>
                  ))}
                  {timed.map((e, i) => {
                    const top = Math.max(0, y(e.start))
                    const h = Math.max(22, y(e.end) - top)
                    const past = Date.parse(e.end) < agenda.now.getTime()
                    const live = !past && Date.parse(e.start) <= agenda.now.getTime()
                    return (
                      <div key={e.id} className={`ag-event ${past ? 'past' : ''} ${live ? 'live' : ''}`} style={{ top, height: h, left: `calc(56px + ${lanes[i]! * 46}%)`, width: shared[i] ? 'calc(46% - 30px)' : undefined, right: shared[i] ? 'auto' : undefined }} data-tip={`${e.title}\n${hm(e.start)} to ${hm(e.end)}${e.where ? `\n${e.where}` : ''}`}>
                        <span className="ag-time">{hm(e.start)}</span>
                        <span className="ag-title">{e.title}</span>
                        {e.join && !past && <button className="small ag-join" onClick={() => join(e.join!)}>Join</button>}
                      </div>
                    )
                  })}
                  {day === 0 && nowY > 0 && nowY < (H1 - H0) * PX && <div className="ag-now" style={{ top: nowY }} />}
                </div>
              </div>
            </>
          )}
          <form className="ag-add" onSubmit={(e) => {
            e.preventDefault()
            setErr('')
            window.stm.calendar.add(name || 'main', url).then(() => { setName(''); setUrl(''); void agenda.refresh() }).catch((x: Error) => setErr(x.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
          }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (work)" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" spellCheck={false} />
            <button className="small" disabled={!url.trim()}>Add calendar</button>
          </form>
          {(err || agenda.errors.length > 0) && <div className="notice error">{err || agenda.errors.map((x) => `${x.calendar}: ${x.error}`).join(' · ')}</div>}
          {agenda.calendars.length > 0 && (
            <div className="ag-cals">
              {agenda.calendars.map((c) => <span key={c} className="chip">{c}<button className="nw-x" onClick={() => void window.stm.calendar.remove(c).then(agenda.refresh)}>×</button></span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
