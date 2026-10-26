import { Presence } from './Presence'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = { id: string; icon: ReactNode; label: string; detail?: string; badge?: number; hot?: boolean; keys?: string; onClick: () => void }

/** A group in the top bar: one icon, a dot or count for what inside wants you, and a grid of tiles. */
export function Menu(props: { icon: ReactNode; label: string; items: MenuItem[] }) {
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
  const count = props.items.reduce((n, i) => n + (i.badge ?? 0), 0)
  const hot = props.items.some((i) => i.hot)
  return (
    <div className="menu" ref={root}>
      <button className={`ghost menu-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title={props.items.map((i) => i.label).join(', ')}>
        {props.icon} <span className="lbl">{props.label}</span>
        {count > 0 ? <span className="count">{count > 99 ? '99+' : count}</span> : hot ? <span className="menu-dot" /> : null}
      </button>
      <Presence show={open}>
        <div className="menu-pop" role="menu">
          {props.items.map((i, n) => (
            <button key={i.id} role="menuitem" className={`menu-tile ${i.hot ? 'hot' : ''}`} style={{ animationDelay: `${n * 25}ms` }} onClick={() => { setOpen(false); i.onClick() }}>
              <span className="menu-ico">{i.icon}{(i.badge ?? 0) > 0 && <span className="count">{i.badge}</span>}</span>
              <span className="menu-label">{i.label}</span>
              {i.detail && <span className="menu-detail">{i.detail}</span>}
              {i.keys && <kbd className="menu-keys">{i.keys}</kbd>}
            </button>
          ))}
        </div>
      </Presence>
    </div>
  )
}
