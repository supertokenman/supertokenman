import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { nextEnabled } from './Select'

/**
 * The right-click menu, drawn by the app. Both the window's own menu (spelling, cut, copy, paste, links:
 * the main process sends the rows and runs the chosen one) and any screen's menu go through here.
 */
export type MenuRow = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean } | 'sep'
type Open = { x: number; y: number; rows: MenuRow[]; before: Element | null }
let show: ((o: Open) => void) | null = null

/** Opens a menu at a point (a mouse event's clientX/clientY). */
export function openContextMenu(at: { clientX: number; clientY: number } | { x: number; y: number }, rows: MenuRow[]) {
  const x = 'clientX' in at ? at.clientX : at.x
  const y = 'clientY' in at ? at.clientY : at.y
  show?.({ x, y, rows, before: document.activeElement })
}

/** Mount once. Also listens for the window's own menu from the main process. */
export function ContextMenuHost() {
  const [cur, setCur] = useState<Open | null>(null)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    show = (o) => {
      setPos(null)
      setActive(-1)
      setCur(o)
    }
    const off = window.stm?.ctx?.onOpen((m) => {
      openContextMenu(m, m.items.map((it, i) => (it.sep ? 'sep' : { label: it.label ?? '', disabled: it.enabled === false, onSelect: () => window.stm.ctx!.pick(i) })))
    })
    return () => {
      show = null
      off?.()
    }
  }, [])
  const items = cur?.rows.filter((r): r is Exclude<MenuRow, 'sep'> => r !== 'sep') ?? []
  const close = (refocus: boolean) => {
    if (refocus) (cur?.before as HTMLElement | null)?.focus?.()
    setCur(null)
  }
  const pick = (r: Exclude<MenuRow, 'sep'>) => {
    if (r.disabled) return
    close(true)
    // the action runs where focus was (paste goes into the field that was right-clicked)
    requestAnimationFrame(() => r.onSelect())
  }
  useLayoutEffect(() => {
    if (!cur || !box.current) return
    const w = box.current.offsetWidth
    const h = box.current.offsetHeight
    setPos({ left: cur.x + w + 8 > window.innerWidth ? Math.max(8, cur.x - w) : cur.x, top: cur.y + h + 8 > window.innerHeight ? Math.max(8, cur.y - h) : cur.y })
  }, [cur])
  useEffect(() => {
    if (!cur) return
    if (active >= 0) box.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.focus()
    else box.current?.focus()
  }, [cur, active, pos])
  useEffect(() => {
    if (!cur) return
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close(false)
    const away = () => close(false)
    const key = (e: KeyboardEvent) => {
      const k = e.key
      if (k === 'ArrowDown' || k === 'ArrowUp') setActive((i) => nextEnabled(items, i < 0 && k === 'ArrowUp' ? items.length : i, k === 'ArrowDown' ? 1 : -1))
      else if (k === 'Home') setActive(nextEnabled(items, -1, 1))
      else if (k === 'End') setActive(nextEnabled(items, items.length, -1))
      else if ((k === 'Enter' || k === ' ') && items[active]) pick(items[active]!)
      else if (k === 'Escape' || k === 'Tab') close(true)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('resize', away)
    window.addEventListener('blur', away)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', away)
      window.removeEventListener('blur', away)
    }
  })
  if (!cur) return null
  let n = -1
  return (
    <div className="mm-layer">
      <div ref={box} className="mm ui-ctx" role="menu" aria-label="Actions" tabIndex={-1} style={pos ?? { visibility: 'hidden', left: cur.x, top: cur.y }} onContextMenu={(e) => e.preventDefault()}>
        {cur.rows.map((r, i) => {
          if (r === 'sep') return <div key={`s${i}`} className="mm-sep" role="separator" />
          const k = ++n
          return (
            <button key={`${i}-${r.label}`} type="button" role="menuitem" data-i={k} tabIndex={-1} aria-disabled={r.disabled || undefined} className={`mm-item${k === active ? ' act' : ''}${r.danger ? ' danger' : ''}`} onPointerDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(r.disabled ? -1 : k)} onClick={() => pick(r)}>
              <span className="mm-label">{r.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
