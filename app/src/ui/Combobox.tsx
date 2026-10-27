import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'

/**
 * A text field with suggestions, in place of <input list> and <datalist>. The field stays a plain
 * input (same props); the suggestions are a listbox under it, filtered by what is typed.
 */
export type ComboOption = { value: string; hint?: string }
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'list'> & { options: (string | ComboOption)[] }

/** The suggestions that match the text, best first: starts-with before contains. */
export function matchOptions(options: ComboOption[], text: string): ComboOption[] {
  const t = text.trim().toLowerCase()
  if (!t) return options
  const starts = options.filter((o) => o.value.toLowerCase().startsWith(t))
  const has = options.filter((o) => !o.value.toLowerCase().startsWith(t) && o.value.toLowerCase().includes(t))
  return [...starts, ...has].filter((o) => o.value.toLowerCase() !== t)
}

const setNative = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function Combobox({ options, onKeyDown, onFocus, onBlur, ...rest }: Props) {
  const all = options.map((o) => (typeof o === 'string' ? { value: o } : o))
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const id = useId()
  const shown = matchOptions(all, String(rest.value ?? input.current?.value ?? '')).slice(0, 50)
  const visible = open && shown.length > 0
  useLayoutEffect(() => {
    if (!visible || !input.current) return
    const r = input.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [visible, shown.length])
  useEffect(() => setActive(-1), [rest.value])
  const choose = (o: ComboOption) => {
    if (input.current) setNative(input.current, o.value)
    setOpen(false)
  }
  return (
    <>
      <input
        ref={input}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? id : undefined}
        aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        {...rest}
        onFocus={(e) => (setOpen(true), onFocus?.(e))}
        onBlur={(e) => (setOpen(false), onBlur?.(e))}
        onInput={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
            if (shown.length) setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % shown.length : i <= 0 ? shown.length - 1 : i - 1))
            return
          }
          if (e.key === 'Enter' && visible && active >= 0 && shown[active]) {
            e.preventDefault()
            choose(shown[active]!)
            return
          }
          if (e.key === 'Escape' && visible) {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            return
          }
          onKeyDown?.(e)
        }}
      />
      {visible &&
        createPortal(
          <div className="mm-layer">
            <div className="mm ui-menu ui-combo" id={id} role="listbox" style={pos ? { top: pos.top, left: pos.left, minWidth: pos.width } : { visibility: 'hidden' }}>
              {shown.map((o, i) => (
                <div key={o.value} id={`${id}-${i}`} role="option" aria-selected={i === active} className={`mm-item${i === active ? ' act' : ''}`} onPointerDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
                  <span className="mm-label">{o.value}</span>
                  {o.hint && <span className="mm-value">{o.hint}</span>}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
