import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { valueEvent, type ValueEvent } from './shared'

// Every control here keeps a real <input> underneath for its semantics (labels, forms, focus, the
// change event handlers already read) and draws its own face over it: nothing the system paints shows.

type Native = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** A checkbox in the app's look (drawn by .ui-check, appearance none). Same props as <input type="checkbox">. */
export const Checkbox = forwardRef<HTMLInputElement, Native>(function Checkbox({ className, ...rest }, ref) {
  return <input ref={ref} type="checkbox" className={`ui-check${className ? ` ${className}` : ''}`} {...rest} />
})

/** An on/off switch: a checkbox with the switch role, on the app's .switch track. Same props as <input type="checkbox">. */
export const Switch = forwardRef<HTMLInputElement, Native>(function Switch({ className, style, ...rest }, ref) {
  return (
    <span className={`switch${className ? ` ${className}` : ''}`} style={style}>
      <input ref={ref} type="checkbox" role="switch" {...rest} />
      <span aria-hidden="true" />
    </span>
  )
})

/** A radio button in the app's look. Same props as <input type="radio">. */
export const Radio = forwardRef<HTMLInputElement, Native>(function Radio({ className, ...rest }, ref) {
  return <input ref={ref} type="radio" className={`ui-radio${className ? ` ${className}` : ''}`} {...rest} />
})

/** Groups radios under one name for assistive tech. */
export function RadioGroup(props: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={props.label} className={`ui-radiogroup${props.className ? ` ${props.className}` : ''}`}>
      {props.children}
    </div>
  )
}

/** Fires React's onChange for a value set from code (the stepper buttons). */
function emitInput(el: HTMLInputElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** A number field with our own stepper. Same props as <input type="number">; arrows and typing work as before. */
export const NumberField = forwardRef<HTMLInputElement, Native>(function NumberField({ style, disabled, ...rest }, ref) {
  const inner = useRef<HTMLInputElement | null>(null)
  const step = (dir: 1 | -1) => {
    const el = inner.current
    if (!el || disabled || el.readOnly) return
    try {
      if (dir > 0) el.stepUp()
      else el.stepDown()
    } catch {
      return
    }
    emitInput(el)
    el.focus()
  }
  return (
    <span className={`ui-num${disabled ? ' off' : ''}`} style={style}>
      <input
        ref={(el) => {
          inner.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        type="number"
        disabled={disabled}
        {...rest}
      />
      <span className="ui-num-steps" aria-hidden="true">
        <button type="button" tabIndex={-1} disabled={disabled} onPointerDown={(e) => e.preventDefault()} onClick={() => step(1)}>
          <svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
        <button type="button" tabIndex={-1} disabled={disabled} onPointerDown={(e) => e.preventDefault()} onClick={() => step(-1)}>
          <svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.4" /></svg>
        </button>
      </span>
    </span>
  )
})

/** A slider drawn by the app (track, fill, thumb). Same props as <input type="range">. */
export const Slider = forwardRef<HTMLInputElement, Native>(function Slider({ className, style, onInput, ...rest }, ref) {
  const inner = useRef<HTMLInputElement | null>(null)
  const paint = () => {
    const el = inner.current
    if (!el) return
    const min = Number(el.min || 0)
    const max = Number(el.max || 100)
    const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0
    el.style.setProperty('--ui-fill', `${Math.min(100, Math.max(0, pct))}%`)
  }
  useLayoutEffect(paint)
  return (
    <input
      ref={(el) => {
        inner.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      type="range"
      className={`ui-slider${className ? ` ${className}` : ''}`}
      style={style}
      onInput={(e) => {
        paint()
        onInput?.(e)
      }}
      {...rest}
    />
  )
})

// ---- date and time: a text field with validation. The system pickers are not used; the formats are
// the ones the native inputs hand over (YYYY-MM-DD, HH:MM, YYYY-MM-DDTHH:MM), shown with a space for the T.

type Kind = 'date' | 'time' | 'datetime'
const FORMAT: Record<Kind, { re: RegExp; hint: string }> = {
  date: { re: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, hint: 'YYYY-MM-DD' },
  time: { re: /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, hint: 'HH:MM' },
  datetime: { re: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[T ]([01]\d|2[0-3]):[0-5]\d$/, hint: 'YYYY-MM-DD HH:MM' },
}
/** Whether text is a valid value of the kind (empty counts: it clears). Exported for tests. */
export function validWhen(kind: Kind, text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (!FORMAT[kind].re.test(t)) return false
  if (kind === 'time') return true
  const [y, m, d] = t.slice(0, 10).split('-').map(Number) as [number, number, number]
  const at = new Date(y, m - 1, d)
  return at.getMonth() === m - 1 && at.getDate() === d
}
const toShown = (kind: Kind, v: string) => (kind === 'datetime' ? v.replace('T', ' ') : v)
const toValue = (kind: Kind, t: string) => (kind === 'datetime' ? t.trim().replace(' ', 'T') : t.trim())

type WhenProps = Omit<Native, 'value' | 'onChange' | 'defaultValue'> & { value?: string; onChange?: (e: ValueEvent) => void }

function WhenField({ kind, value, onChange, className, placeholder, onBlur, ...rest }: WhenProps & { kind: Kind }) {
  const [draft, setDraft] = useState(toShown(kind, value ?? ''))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current || toValue(kind, draft) !== value) setDraft(toShown(kind, value ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const ok = validWhen(kind, draft)
  return (
    <input
      type="text"
      inputMode="numeric"
      spellCheck={false}
      autoComplete="off"
      className={`ui-when${ok ? '' : ' bad'}${className ? ` ${className}` : ''}`}
      placeholder={placeholder ?? FORMAT[kind].hint}
      aria-invalid={!ok || undefined}
      data-tip={ok ? undefined : `Use ${FORMAT[kind].hint}`}
      value={draft}
      onFocus={() => (focused.current = true)}
      onBlur={(e) => {
        focused.current = false
        if (!validWhen(kind, draft)) setDraft(toShown(kind, value ?? ''))
        onBlur?.(e)
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        if (validWhen(kind, e.target.value)) onChange?.(valueEvent(toValue(kind, e.target.value), { id: rest.id, name: rest.name }))
      }}
      {...rest}
    />
  )
}
export const DateField = (p: WhenProps) => <WhenField kind="date" {...p} />
export const TimeField = (p: WhenProps) => <WhenField kind="time" {...p} />
export const DateTimeField = (p: WhenProps) => <WhenField kind="datetime" {...p} />

// ---- color: a swatch that opens a small panel of our own (the theme's colors and a hex field)

const PRESETS = ['#d97757', '#c15f3c', '#e2876a', '#c9a26b', '#9fc48a', '#4f7a3a', '#9fb7d9', '#3f6697', '#b48ead', '#e58a6c', '#ecebe6', '#8f8d86', '#1f1e1b', '#0f0f0e', '#faf9f5', '#ffffff']
const HEX = /^#[0-9a-f]{6}$/i

export function ColorField(props: { value: string; onChange: (e: ValueEvent) => void; className?: string; style?: CSSProperties; id?: string; disabled?: boolean; 'aria-label'?: string; 'data-tip'?: string }) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(props.value)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pane = useRef<HTMLDivElement>(null)
  const label = useId()
  useEffect(() => setHex(props.value), [props.value])
  useLayoutEffect(() => {
    if (!open || !btn.current || !pane.current) return
    const r = btn.current.getBoundingClientRect()
    const w = pane.current.offsetWidth
    const h = pane.current.offsetHeight
    setPos({ top: r.bottom + h + 10 < window.innerHeight ? r.bottom + 6 : r.top - h - 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) })
  }, [open])
  useEffect(() => {
    if (!open) return
    pane.current?.querySelector<HTMLElement>('[aria-pressed="true"], button')?.focus()
    const down = (e: PointerEvent) => !pane.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])
  const set = (c: string) => props.onChange(valueEvent(c.toLowerCase(), { id: props.id }))
  return (
    <>
      <button ref={btn} type="button" id={props.id} disabled={props.disabled} className={`ui-color${props.className ? ` ${props.className}` : ''}`} style={{ ...props.style, ['--swatch' as string]: props.value }} aria-label={props['aria-label'] ?? `Color ${props.value}`} data-tip={props['data-tip']} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="ui-color-chip" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={pane} className="mm ui-color-pane" role="dialog" aria-labelledby={label} style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}>
            <div id={label} className="ui-group-label">{props['aria-label'] ?? 'Color'}</div>
            <div className="ui-color-grid">
              {PRESETS.map((c) => (
                <button key={c} type="button" className="ui-color-cell" style={{ ['--swatch' as string]: c }} aria-label={c} aria-pressed={c.toLowerCase() === props.value.toLowerCase()} onClick={() => (set(c), setOpen(false), btn.current?.focus())} />
              ))}
            </div>
            <input
              className="ui-color-hex"
              aria-label="Hex color"
              spellCheck={false}
              value={hex}
              aria-invalid={!HEX.test(hex) || undefined}
              onChange={(e) => {
                const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                setHex(v)
                if (HEX.test(v)) set(v)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (setOpen(false), btn.current?.focus())}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
