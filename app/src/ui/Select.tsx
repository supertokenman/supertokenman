import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Chevron, textOf, valueEvent, type ValueEvent } from './shared'

/**
 * The app's own select, drawn like the model menu. Its children are the same <option> and <optgroup>
 * elements a native <select> takes, so a migration only renames the tag. An <optgroup data-sub> opens
 * as a submenu instead of a labelled group.
 */
export type SelectProps = {
  value?: string | number
  defaultValue?: string | number
  onChange?: (e: ValueEvent) => void
  children?: ReactNode
  disabled?: boolean
  placeholder?: string
  id?: string
  name?: string
  className?: string
  style?: CSSProperties
  autoFocus?: boolean
  onBlur?: () => void
  onKeyDown?: (e: RKeyboardEvent<HTMLButtonElement>) => void
  'aria-label'?: string
  'aria-labelledby'?: string
  'data-tip'?: string
}

type Opt = { kind: 'opt'; value: string; label: ReactNode; text: string; disabled: boolean }
type Group = { kind: 'group'; label: string; sub: boolean; opts: Opt[] }
type Entry = Opt | Group

function collect(children: ReactNode, out: Entry[] = []): Entry[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    const p = c.props as Record<string, unknown> & { children?: ReactNode }
    if (c.type === Fragment) collect(p.children, out)
    else if (c.type === 'option') {
      const text = textOf(p.children)
      out.push({ kind: 'opt', value: String(p.value ?? text), label: p.children ?? text, text, disabled: Boolean(p.disabled) })
    } else if (c.type === 'optgroup') {
      const opts = collect(p.children).flatMap((e) => (e.kind === 'opt' ? [e] : e.opts))
      out.push({ kind: 'group', label: String(p.label ?? ''), sub: p['data-sub'] !== undefined && p['data-sub'] !== false, opts })
    }
  })
  return out
}

/** Moves to the next enabled index in a direction, wrapping. */
export function nextEnabled(list: { disabled?: boolean }[], from: number, dir: 1 | -1): number {
  const n = list.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + dir * k) % n) + n) % n
    if (!list[i]!.disabled) return i
  }
  return from
}

export function Select(props: SelectProps) {
  const { value: controlled, defaultValue, onChange, children, disabled, placeholder, className, style, autoFocus, onBlur, onKeyDown } = props
  const [own, setOwn] = useState(String(defaultValue ?? ''))
  const value = controlled !== undefined ? String(controlled) : own
  const entries = collect(children)
  // the rows of the top level: options (a labelled group's flattened in) and submenu rows
  const top: (Opt | Group)[] = entries.flatMap((e) => (e.kind === 'opt' || e.sub ? [e] : e.opts))
  const focusable = top.map((e) => ({ disabled: e.kind === 'opt' ? e.disabled : e.opts.every((o) => o.disabled) }))
  const all: Opt[] = entries.flatMap((e) => (e.kind === 'opt' ? [e] : e.opts))
  const current = all.find((o) => o.value === value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [sub, setSub] = useState<Group | null>(null)
  const [subActive, setSubActive] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const [flip, setFlip] = useState(false)
  const [subTop, setSubTop] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const subMenu = useRef<HTMLDivElement>(null)
  const typed = useRef({ s: '', t: 0 })
  const listId = useId()

  const pick = (o: Opt) => {
    if (o.disabled) return
    if (controlled === undefined) setOwn(o.value)
    if (o.value !== value) onChange?.(valueEvent(o.value, { id: props.id, name: props.name }))
    close()
  }
  const close = (refocus = true) => {
    setOpen(false)
    setSub(null)
    if (refocus) trigger.current?.focus()
  }
  const openMenu = () => {
    if (disabled) return
    const i = top.findIndex((e) => (e.kind === 'opt' ? e.value === value : e.opts.some((o) => o.value === value)))
    setActive(i >= 0 ? i : Math.max(0, nextEnabled(focusable, -1, 1)))
    setSub(null)
    setPos(null)
    setOpen(true)
  }
  const openSub = (g: Group) => {
    const row = menu.current?.querySelector<HTMLElement>(`[data-sub-row="${CSS.escape(g.label)}"]`)
    setSubTop((row?.offsetTop ?? 0) - 6)
    setSub(g)
    const cur = g.opts.findIndex((o) => o.value === value)
    setSubActive(cur >= 0 ? cur : Math.max(0, nextEnabled(g.opts, -1, 1)))
  }
  // type to jump: the first row whose words start with what was typed
  const seek = (ch: string, list: { text: string; disabled: boolean }[], from: number): number | null => {
    const now = Date.now()
    typed.current = { s: now - typed.current.t < 700 ? typed.current.s + ch.toLowerCase() : ch.toLowerCase(), t: now }
    const s = typed.current.s
    const n = list.length
    for (let k = s.length === 1 ? 1 : 0; k <= n; k++) {
      const i = (from + k) % n
      if (!list[i]!.disabled && list[i]!.text.toLowerCase().startsWith(s)) return i
    }
    return null
  }
  const topText = top.map((e, i) => ({ text: e.kind === 'opt' ? e.text : e.label, disabled: focusable[i]!.disabled }))

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const t = trigger.current.getBoundingClientRect()
    const w = Math.max(menu.current.offsetWidth, t.width)
    const h = menu.current.offsetHeight
    const below = t.bottom + 6 + h < window.innerHeight - 8 || t.top - h - 6 < 8
    setPos({ top: below ? t.bottom + 4 : t.top - h - 4, left: Math.max(8, Math.min(t.left, window.innerWidth - w - 8)), minWidth: t.width })
  }, [open])
  useLayoutEffect(() => {
    if (!sub || !menu.current || !subMenu.current) return
    const m = menu.current.getBoundingClientRect()
    setFlip(m.right + subMenu.current.offsetWidth + 4 > window.innerWidth - 8)
  }, [sub, pos])
  useEffect(() => {
    if (!open) return
    const root = sub ? subMenu.current : menu.current
    const el = root?.querySelector<HTMLElement>(`[data-i="${sub ? subActive : active}"]`)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, sub, active, subActive, pos])
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const n = e.target as Node
      if (!menu.current?.contains(n) && !subMenu.current?.contains(n) && !trigger.current?.contains(n)) close(false)
    }
    const away = (e: Event) => {
      if (e.type === 'scroll' && (menu.current?.contains(e.target as Node) || subMenu.current?.contains(e.target as Node))) return
      close(false)
    }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('resize', away)
    window.addEventListener('scroll', away, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('resize', away)
      window.removeEventListener('scroll', away, true)
    }
  }, [open])

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key
    if (sub) {
      if (k === 'ArrowDown' || k === 'ArrowUp') setSubActive((i) => nextEnabled(sub.opts, i, k === 'ArrowDown' ? 1 : -1))
      else if (k === 'Home') setSubActive(nextEnabled(sub.opts, -1, 1))
      else if (k === 'End') setSubActive(nextEnabled(sub.opts, sub.opts.length, -1))
      else if (k === 'Enter' || k === ' ') sub.opts[subActive] && pick(sub.opts[subActive]!)
      else if (k === 'ArrowLeft' || k === 'Escape') setSub(null)
      else if (k === 'Tab') close(false)
      else if (k.length === 1) {
        const i = seek(k, sub.opts, subActive)
        if (i === null) return
        setSubActive(i)
      } else return
    } else {
      const r = top[active]
      if (k === 'ArrowDown' || k === 'ArrowUp') setActive((i) => nextEnabled(focusable, i, k === 'ArrowDown' ? 1 : -1))
      else if (k === 'Home') setActive(nextEnabled(focusable, -1, 1))
      else if (k === 'End') setActive(nextEnabled(focusable, top.length, -1))
      else if (k === 'Enter' || k === ' ') r && (r.kind === 'opt' ? pick(r) : openSub(r))
      else if (k === 'ArrowRight' && r?.kind === 'group') openSub(r)
      else if (k === 'Escape') close()
      else if (k === 'Tab') close(false)
      else if (k.length === 1) {
        const i = seek(k, topText, active)
        if (i === null) return
        setActive(i)
      } else return
    }
    e.preventDefault()
    e.stopPropagation()
  }
  const keyRef = useRef(onMenuKey)
  keyRef.current = onMenuKey
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [open])

  const onTriggerKey = (e: RKeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented || open || disabled) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu()
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // closed and typed at: choose the matching option in place, as a native select does
      const opts = all.map((o) => ({ text: o.text, disabled: o.disabled }))
      const i = seek(e.key, opts, Math.max(0, all.findIndex((o) => o.value === value)))
      if (i !== null && all[i]!.value !== value) {
        if (controlled === undefined) setOwn(all[i]!.value)
        onChange?.(valueEvent(all[i]!.value, { id: props.id, name: props.name }))
      }
    }
  }

  const row = (o: Opt, i: number, isActive: boolean, onHover: () => void) => (
    <div key={`${o.value}-${i}`} id={`${listId}-${o.value}`} data-i={i} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined} tabIndex={-1} className={`mm-item ui-opt${isActive ? ' act' : ''}`} onMouseEnter={onHover} onClick={() => pick(o)}>
      <span className="mm-tick">{o.value === value && <Check />}</span>
      <span className="mm-label">{o.label}</span>
    </div>
  )

  let groupSeen = false
  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={props.id}
        name={props.name}
        className={`ui-select${open ? ' on' : ''}${className ? ` ${className}` : ''}`}
        style={style}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={props['aria-label']}
        aria-labelledby={props['aria-labelledby']}
        data-tip={props['data-tip']}
        data-value={value}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
        onBlur={() => !open && onBlur?.()}
      >
        <span className="ui-select-face">
          <span className={`ui-select-label${current ? '' : ' ph'}`}>{current ? current.label : placeholder ?? ''}</span>
          {/* as wide as the widest option, like a native select, so the field does not jump */}
          {all.slice(0, 200).map((o, i) => (
            <span key={i} className="ui-select-sizer" aria-hidden="true">{o.label}</span>
          ))}
        </span>
      </button>
      {open &&
        createPortal(
          <div className="mm-layer">
            <div ref={menu} id={listId} className="mm ui-menu" role="listbox" aria-label={props['aria-label']} aria-labelledby={props['aria-label'] ? undefined : props['aria-labelledby']} style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : { visibility: 'hidden' }}>
              {top.map((e, i) => {
                if (e.kind === 'group') {
                  return (
                    <div key={`g-${e.label}`} role="presentation">
                      <div className="mm-sep" role="separator" />
                      <div role="option" aria-selected={e.opts.some((o) => o.value === value)} aria-haspopup="listbox" aria-expanded={sub === e} data-i={i} data-sub-row={e.label} tabIndex={-1} className={`mm-item${i === active ? ' act' : ''}${sub === e ? ' open' : ''}`} onMouseEnter={() => (setActive(i), openSub(e))} onClick={() => openSub(e)}>
                        <span className="mm-tick" />
                        <span className="mm-label">{e.label}</span>
                        {e.opts.some((o) => o.value === value) && <span className="mm-value">{current?.text}</span>}
                        <Chevron />
                      </div>
                    </div>
                  )
                }
                // a labelled group's header sits above its first option
                const g = entries.find((x): x is Group => x.kind === 'group' && !x.sub && x.opts[0] === e)
                const head = g ? (
                  <div key={`h-${g.label}`} role="presentation">
                    {groupSeen || i > 0 ? <div className="mm-sep" role="separator" /> : null}
                    <div className="ui-group-label" role="presentation">{g.label}</div>
                  </div>
                ) : null
                if (g) groupSeen = true
                return (
                  <Fragment key={`o-${e.value}-${i}`}>
                    {head}
                    {row(e, i, i === active && !sub, () => (setActive(i), setSub(null)))}
                  </Fragment>
                )
              })}
              {sub && (
                <div ref={subMenu} className={`mm mm-sub ui-menu${flip ? ' flip' : ''}`} role="listbox" aria-label={sub.label} style={{ top: subTop }}>
                  {sub.opts.map((o, i) => row(o, i, i === subActive, () => setSubActive(i)))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
