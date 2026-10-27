import { useEffect } from 'react'
import { IconClose } from './icons'
import type { Event } from '../electron/calendar'
import type { Item } from '../electron/news'
import type { DayLog } from './day'
import type { Need } from './needs'
import { join } from './Agenda'

const hm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const folder = (cwd: string) => cwd.split('/').filter(Boolean).slice(-2).join('/')

/** The morning: the day as a strip of shapes, what blocks you, where yesterday stopped, three stories. */
export function TodaySheet(props: {
  events: Event[]
  needs: Need[]
  yesterday: DayLog | null
  stories: Item[]
  onGo: (n: Need) => void
  onResume: (cwd: string, sessionId?: string) => void
  onStory: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])
  const now = new Date()
  const hour = now.getHours()
  const hello = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = props.events.filter((e) => !e.allDay && new Date(e.start).toDateString() === now.toDateString())
  const minutes = today.reduce((m, e) => m + (Date.parse(e.end) - Date.parse(e.start)) / 60000, 0)
  const blockers = props.needs.filter((n) => n.level === 0)
  const soon = props.needs.filter((n) => n.level === 1)
  // the day from 8 to 20 as one bar: meetings as blocks, now as a line
  const x = (iso: string | Date) => Math.min(100, Math.max(0, ((new Date(iso).getHours() + new Date(iso).getMinutes() / 60 - 8) / 12) * 100))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet today" role="dialog" aria-label="Today">
        <div className="td-hero">
          <div>
            <div className="td-date">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div className="td-hello">{hello}.</div>
          </div>
          <div className="td-stats">
            <span className="td-stat"><b>{today.length}</b>{today.length === 1 ? 'meeting' : 'meetings'}</span>
            <span className="td-stat"><b className={blockers.length ? 'bad' : ''}>{blockers.length}</b>blocking</span>
            <span className="td-stat"><b>{Math.max(0, Math.round((8 * 60 - minutes) / 60))}h</b>free to build</span>
          </div>
          <button className="icon td-close" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </div>

        <div className="td-strip" aria-label="Today from 8 to 20">
          {today.map((e) => (
            <span key={e.id} className="td-block" style={{ left: `${x(e.start)}%`, width: `${Math.max(1.2, x(e.end) - x(e.start))}%` }} data-tip={`${hm(e.start)} ${e.title}`} role="img" aria-label={`${hm(e.start)} ${e.title}`} />
          ))}
          <span className="td-now" style={{ left: `${x(now)}%` }} />
          {[8, 10, 12, 14, 16, 18, 20].map((h) => <span key={h} className={`td-tick${h === 8 ? ' first' : h === 20 ? ' last' : ''}`} style={{ left: `${((h - 8) / 12) * 100}%` }}>{h}</span>)}
        </div>

        <div className="sheet-body td-grid">
          <section>
            <div className="td-sub">Meetings</div>
            {today.length === 0 && <div className="faint td-none">No meetings. A whole day to build.</div>}
            {today.map((e) => (
              <div key={e.id} className={`td-row ${Date.parse(e.end) < now.getTime() ? 'past' : ''}`}>
                <span className="td-time">{hm(e.start)}</span>
                <span className="td-what">{e.title}</span>
                {e.join && Date.parse(e.end) > now.getTime() && <button className="ghost small" onClick={() => join(e.join!)}>Join</button>}
              </div>
            ))}
          </section>
          <section>
            <div className="td-sub">Needs you</div>
            {blockers.length + soon.length === 0 && <div className="faint td-none">Nothing waiting.</div>}
            {[...blockers, ...soon].slice(0, 6).map((n) => (
              <button key={n.id} className="td-row link" onClick={() => { props.onClose(); props.onGo(n) }}>
                <svg width="12" height="12" viewBox="0 0 14 14" className={`l${n.level}`}>{n.level === 0 ? <rect x="2" y="2" width="10" height="10" rx="1.5" /> : <circle cx="7" cy="7" r="5" />}</svg>
                <span className="td-what">{n.title}</span>
              </button>
            ))}
          </section>
          <section>
            <div className="td-sub">Where you stopped{props.yesterday ? `, ${new Date(props.yesterday.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'long' })}` : ''}</div>
            {!props.yesterday && <div className="faint td-none">Nothing saved yet. Tonight's panels show up here tomorrow.</div>}
            {props.yesterday?.stops.slice(0, 5).map((s) => (
              <div key={s.cwd} className="td-stop">
                <span className="td-folder">{folder(s.cwd)}</span>
                <span className="td-last">{s.last || `${s.turns} turns`}</span>
                <button className="small" onClick={() => { props.onClose(); props.onResume(s.cwd, s.sessionId) }}>{s.sessionId ? 'Resume' : 'Open'}</button>
              </div>
            ))}
          </section>
          <section>
            <div className="td-sub">Three stories</div>
            {props.stories.length === 0 && <div className="faint td-none">No stories yet. Add feeds in News to see the top three here.</div>}
            {props.stories.slice(0, 3).map((i) => (
              <button key={i.id} className="td-row link" onClick={() => { props.onClose(); props.onStory() }}>
                <span className="td-src">{i.source}</span>
                <span className="td-what">{i.title}</span>
              </button>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
