import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * The panel header's "More" button: the less used panel controls (model source, trim tools, isolate,
 * usage, links, export) live in a small tray under it instead of crowding the header. The tray stays
 * mounted while closed, so each control keeps its state and its own popover keeps working after the
 * tray closes.
 */
export function PanelMore(props: { children: ReactNode; sid: string }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ top: 0, right: 0 })
  const btn = useRef<HTMLButtonElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!tray.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => (window.removeEventListener('pointerdown', down, true), window.removeEventListener('keydown', key))
  }, [open])
  useEffect(() => {
    if (open) tray.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  }, [open])
  const toggle = () => {
    const r = btn.current!.getBoundingClientRect()
    setAt({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
    setOpen(!open)
  }
  return (
    <>
      <button ref={btn} className="ghost small icon more-btn" aria-label="More panel controls" aria-expanded={open} aria-haspopup="true" data-tip="Model source, tools, isolation, usage, export" onClick={toggle}>
        <svg viewBox="0 0 16 16" aria-hidden><circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" /></svg>
      </button>
      {createPortal(
        <div ref={tray} className="more-tray" role="group" aria-label={`More controls for panel ${props.sid}`} hidden={!open} style={{ top: at.top, right: at.right }}>
          {props.children}
        </div>,
        document.body,
      )}
    </>
  )
}
