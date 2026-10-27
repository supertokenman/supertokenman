import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { modelLabel, type Effort } from '../shared/models'
import { EFFORT_LABEL, effortRows, mainRows, moreRows, shortcut, step, triggerLabel, validEffort, type Row } from './modelMenuLogic'

type Sub = 'effort' | 'more' | null

const Check = () => (
  <svg className="mm-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Chevron = () => (
  <svg className="mm-chev" width="8" height="10" viewBox="0 0 8 10" aria-hidden="true"><path d="M2.5 1.5L6 5 2.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

/** The toolbar's model and effort picker: one trigger, a popover with submenus for effort and older models. */
export function ModelMenu({ model, effort, onModel, onEffort, defaultModel }: { model: string; effort: string; onModel: (id: string) => void; onEffort: (e: string) => void; defaultModel?: string }) {
  const [open, setOpen] = useState(false)
  const [sub, setSub] = useState<Sub>(null)
  const [active, setActive] = useState(0)
  const [subActive, setSubActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [flip, setFlip] = useState(false)
  const [subTop, setSubTop] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const subMenu = useRef<HTMLDivElement>(null)
  const rows = mainRows(model)
  const eff = validEffort(model, effort)
  const subValues = sub === 'effort' ? effortRows(model) : sub === 'more' ? moreRows() : []

  const close = (refocus = true) => {
    setOpen(false)
    setSub(null)
    if (refocus) trigger.current?.focus()
  }
  const openMenu = () => {
    const i = rows.findIndex((r) => r.kind === 'model' && r.id === model)
    setActive(i >= 0 ? i : Math.max(0, rows.findIndex((r) => r.kind === 'more')))
    setSub(null)
    setOpen(true)
  }
  const openSub = (s: Exclude<Sub, null>) => {
    const vals = s === 'effort' ? effortRows(model) : moreRows()
    const cur = vals.indexOf(s === 'effort' ? eff : model)
    const row = menu.current?.querySelector<HTMLElement>(`[data-row="${s}"]`)
    setSubTop((row?.offsetTop ?? 0) - 6)
    setSub(s)
    setSubActive(cur >= 0 ? cur : 0)
  }
  const choose = (r: Row) => {
    if (r.kind === 'model') {
      onModel(r.id)
      close()
    } else openSub(r.kind)
  }
  const chooseSub = (v: string) => {
    if (sub === 'effort') onEffort(v)
    else onModel(v)
    close()
  }

  // place the popover under the trigger, kept on screen
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const t = trigger.current.getBoundingClientRect()
    const w = menu.current.offsetWidth
    setPos({ top: t.bottom + 6, left: Math.max(8, Math.min(t.left, window.innerWidth - w - 8)) })
  }, [open])
  // submenus open to the right, or to the left when there is no room
  useLayoutEffect(() => {
    if (!sub || !menu.current || !subMenu.current) return
    const m = menu.current.getBoundingClientRect()
    setFlip(m.right + subMenu.current.offsetWidth + 4 > window.innerWidth - 8)
  }, [sub, pos])
  // focus follows the active row
  useEffect(() => {
    if (!open) return
    const root = sub ? subMenu.current : menu.current
    const i = sub ? subActive : active
    root?.querySelectorAll<HTMLElement>('[role^="menuitem"]')[i]?.focus()
  }, [open, sub, active, subActive])
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const n = e.target as Node
      if (!menu.current?.contains(n) && !subMenu.current?.contains(n) && !trigger.current?.contains(n)) close(false)
    }
    const blur = () => close(false)
    document.addEventListener('pointerdown', down)
    window.addEventListener('resize', blur)
    return () => {
      document.removeEventListener('pointerdown', down)
      window.removeEventListener('resize', blur)
    }
  }, [open])

  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    if (sub) {
      if (k === 'ArrowDown' || k === 'ArrowUp') setSubActive((i) => step(i, subValues.length, k === 'ArrowDown' ? 1 : -1))
      else if (k === 'Home') setSubActive(0)
      else if (k === 'End') setSubActive(subValues.length - 1)
      else if (k === 'Enter' || k === ' ') chooseSub(subValues[subActive]!)
      else if (k === 'ArrowLeft' || k === 'Escape') setSub(null)
      else if (k === 'Tab') close(false)
      else return
    } else {
      const r = rows[active]
      const pick = shortcut(k, rows)
      if (k === 'ArrowDown' || k === 'ArrowUp') setActive((i) => step(i, rows.length, k === 'ArrowDown' ? 1 : -1))
      else if (k === 'Home') setActive(0)
      else if (k === 'End') setActive(rows.length - 1)
      else if (k === 'Enter' || k === ' ') r && choose(r)
      else if (k === 'ArrowRight' && r && r.kind !== 'model') openSub(r.kind)
      else if (k === 'Escape' || k === 'ArrowLeft') close()
      else if (k === 'Tab') close(false)
      else if (pick !== null) {
        onModel(pick)
        close()
      } else return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  // keys go to the menu while it is open, whatever has focus, ahead of the app's shortcuts
  const keyRef = useRef(onKey)
  keyRef.current = onKey
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [open])

  let n = 0
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`mm-trigger${open ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-tip="Model and effort for new panels"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openMenu()
          }
        }}
      >
        <span className="mm-trigger-label">{triggerLabel(model, effort)}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true"><path d="M1 1l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
      </button>
      {open && (
        <div className="mm-layer">
          <div ref={menu} className="mm" role="menu" aria-label="Model for new panels" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
            {rows.map((r, i) => {
              if (r.kind === 'model') {
                n++
                const on = r.id === model
                return (
                  <button key={r.id || 'default'} type="button" role="menuitemradio" aria-checked={on} tabIndex={-1} className={`mm-item${i === active && !sub ? ' act' : ''}`} onMouseEnter={() => (setActive(i), setSub(null))} onClick={() => choose(r)}>
                    <span className="mm-tick">{on && <Check />}</span>
                    <span className="mm-label">{r.label}</span>
                    {defaultModel !== undefined && r.id === defaultModel && <span className="mm-pill">Default</span>}
                    <kbd className="mm-key">{n}</kbd>
                  </button>
                )
              }
              const isEffort = r.kind === 'effort'
              return (
                <div key={r.kind}>
                  <div className="mm-sep" role="separator" />
                  <button type="button" role="menuitem" data-row={r.kind} aria-haspopup="menu" aria-expanded={sub === r.kind} tabIndex={-1} className={`mm-item${i === active ? ' act' : ''}${sub === r.kind ? ' open' : ''}`} onMouseEnter={() => (setActive(i), openSub(r.kind))} onClick={() => openSub(r.kind)}>
                    <span className="mm-tick" />
                    <span className="mm-label">{isEffort ? 'Effort' : 'More models'}</span>
                    {isEffort && <span className="mm-value">{eff ? EFFORT_LABEL[eff as Effort] : 'Default'}</span>}
                    {!isEffort && model && rows.every((x) => x.kind !== 'model' || x.id !== model) && <span className="mm-value">{modelLabel(model)}</span>}
                    <Chevron />
                  </button>
                </div>
              )
            })}
            {sub && (
              <div ref={subMenu} className={`mm mm-sub${flip ? ' flip' : ''}`} role="menu" aria-label={sub === 'effort' ? 'Effort' : 'More models'} style={{ top: subTop }}>
                {subValues.map((v, i) => {
                  const on = sub === 'effort' ? v === eff : v === model
                  const label = sub === 'effort' ? (v ? EFFORT_LABEL[v as Effort] : 'Default') : modelLabel(v)
                  return (
                    <button key={v || 'default'} type="button" role="menuitemradio" aria-checked={on} tabIndex={-1} className={`mm-item${i === subActive ? ' act' : ''}`} onMouseEnter={() => setSubActive(i)} onClick={() => chooseSub(v)}>
                      <span className="mm-tick">{on && <Check />}</span>
                      <span className="mm-label">{label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
