import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'

/**
 * The tour: short videos of the real app, one chapter per thing it does, recorded from the app
 * itself (scripts/tour). Each chapter ends with Try it, which opens that part of the app for real.
 */
export type TourChapter = { id: string; title: string; try: string; steps: { title: string; say?: string; start: number; dur: number }[] }

const SEEN = 'stm.tour.seen'
const DONE = 'stm.tour.done'
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // storage off: the tour shows again next launch
  }
}

/** True the first time the app opens, so the tour greets a new person once. */
export const firstRun = () => !read(SEEN)

export function Tour(props: { onClose: () => void; onTry: (what: string) => void }) {
  const [chapters, setChapters] = useState<TourChapter[]>([])
  const [cur, setCur] = useState(0)
  const [time, setTime] = useState(0)
  const [done, setDone] = useState<string[]>(() => (read(DONE) ?? '').split(',').filter(Boolean))
  const [missing, setMissing] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    write(SEEN, '1')
    fetch('tour/index.json')
      .then((r) => r.json())
      .then((ids: string[]) => Promise.all(ids.map((id) => fetch(`tour/${id}.json`).then((r) => r.json() as Promise<TourChapter>))))
      .then(setChapters)
      .catch(() => setMissing(true))
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props])
  const ch = chapters[cur]
  const step = ch ? ch.steps.reduce((at, s, i) => (time >= s.start ? i : at), -1) : -1
  const finish = (id: string) => {
    if (done.includes(id)) return
    const next = [...done, id]
    setDone(next)
    write(DONE, next.join(','))
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet tour" role="dialog" aria-label="Tour">
        <header className="sheet-head">
          <div className="sheet-title">Tour</div>
          <span className="faint">{chapters.length ? `${done.length} of ${chapters.length} watched` : 'The app, a minute at a time'}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="tour-body">
          <nav className="tour-list">
            {chapters.map((c, i) => (
              <button key={c.id} className={`tour-ch ${i === cur ? 'on' : ''}`} onClick={() => (setCur(i), setTime(0))}>
                <span className={`tour-dot ${done.includes(c.id) ? 'done' : ''}`} aria-label={done.includes(c.id) ? 'Watched' : undefined}>
                  {done.includes(c.id) ? <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg> : String(i + 1).padStart(2, '0')}
                </span>
                <span className="tour-ch-title">{c.title}</span>
                <span className="faint">{Math.round(c.steps.reduce((a, s) => Math.max(a, s.start + s.dur), 0))}s</span>
              </button>
            ))}
            {missing && <div className="faint tour-missing">The tour videos are not in this build.</div>}
          </nav>
          {ch && (
            <div className="tour-main">
              <video
                key={ch.id}
                ref={video}
                className="tour-video"
                src={`tour/${ch.id}.mp4`}
                controls
                autoPlay
                playsInline
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onEnded={() => finish(ch.id)}
              />
              <ol className="tour-steps">
                {ch.steps.map((s, i) => (
                  <li key={i} className={i === step ? 'on' : i < step ? 'past' : ''}>
                    <button onClick={() => video.current && ((video.current.currentTime = s.start), void video.current.play())}>
                      <span className="tour-step-n">{String(i + 1).padStart(2, '0')}</span>
                      <span className="tour-step-title">{s.title}</span>
                      <span className="tour-step-say">{s.say ?? ''}</span>
                      <span className="tour-step-bar" style={{ '--p': i === step ? Math.min(1, Math.max(0, (time - s.start) / s.dur)) : i < step ? 1 : 0 } as React.CSSProperties} />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="tour-actions">
                {cur + 1 < chapters.length && <button className="ghost small" onClick={() => (finish(ch.id), setCur(cur + 1), setTime(0))}>Next chapter</button>}
                <button className="primary small" onClick={() => (finish(ch.id), props.onTry(ch.try))}>Try it</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
