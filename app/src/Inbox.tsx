import { useEffect, useRef, useState } from 'react'
import type { Need } from './needs'

const SHAPE: Record<Need['level'], JSX.Element> = {
  0: <rect x="2" y="2" width="10" height="10" rx="1.5" />,
  1: <circle cx="7" cy="7" r="5" />,
  2: <path d="M7 2 12.5 12h-11z" />,
}

/** The bell: one count of what blocks you now, and the full ranked list under it. */
export function InboxButton({ items, onGo }: { items: Need[]; onGo: (n: Need) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  const urgent = items.filter((i) => i.level === 0).length
  const soon = items.filter((i) => i.level === 1).length
  return (
    <div className="menu" ref={root}>
      <button className={`ghost menu-btn inbox-btn ${urgent ? 'urgent' : ''} ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} data-tip="What needs you">
        <svg className="ico" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1.25 1.25H2.75z" />
          <path d="M6.5 14.25h3" />
        </svg>
        {urgent > 0 ? <span className="count hot">{urgent}</span> : soon > 0 ? <span className="count">{soon}</span> : null}
      </button>
      {open && (
        <div className="inbox-pop" role="menu">
          <div className="inbox-head">
            <b>Needs you</b>
            <span className="inbox-legend">
              <svg width="14" height="14" viewBox="0 0 14 14" className="l0">{SHAPE[0]}</svg> now
              <svg width="14" height="14" viewBox="0 0 14 14" className="l1">{SHAPE[1]}</svg> soon
              <svg width="14" height="14" viewBox="0 0 14 14" className="l2">{SHAPE[2]}</svg> later
            </span>
          </div>
          {items.length === 0 && (
            <div className="inbox-empty">
              <svg viewBox="0 0 120 60" aria-hidden="true"><circle cx="30" cy="30" r="18" /><path d="M58 30h40" /><path d="M86 20l12 10-12 10" /></svg>
              Nothing needs you. Go build.
            </div>
          )}
          {items.map((n, i) => (
            <button key={n.id} role="menuitem" className={`inbox-item l${n.level}`} style={{ animationDelay: `${i * 20}ms` }} onClick={() => { setOpen(false); onGo(n) }}>
              <svg width="14" height="14" viewBox="0 0 14 14" className={`l${n.level}`}>{SHAPE[n.level]}</svg>
              <span className="inbox-text">
                <span className="inbox-title">{n.title}</span>
                {n.detail && <span className="inbox-detail">{n.detail}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
