import { useEffect, useId, useRef, useState } from 'react'

/**
 * The app's own confirm, alert and prompt: a promise each, drawn in the window instead of the system's
 * sheet. `await confirmDialog({ message })` is true for OK. Mount <DialogHost /> once.
 */
export type DialogOptions = {
  title?: string
  message: string
  /** The confirming button's words; "OK" by default. */
  confirm?: string
  cancel?: string
  /** A destructive action: the confirming button is drawn as a warning. */
  danger?: boolean
}
type Req =
  | (DialogOptions & { kind: 'confirm'; resolve: (v: boolean) => void })
  | (DialogOptions & { kind: 'alert'; resolve: (v: void) => void })
  | (DialogOptions & { kind: 'prompt'; value?: string; placeholder?: string; resolve: (v: string | null) => void })

const queue: Req[] = []
let wake: (() => void) | null = null
const push = (r: Req) => {
  queue.push(r)
  wake?.()
}
const opts = (o: DialogOptions | string): DialogOptions => (typeof o === 'string' ? { message: o } : o)

/** Asks a yes or no question; true for the confirming button. Without a host mounted it answers false. */
export function confirmDialog(o: DialogOptions | string): Promise<boolean> {
  return new Promise((resolve) => (wake ? push({ ...opts(o), kind: 'confirm', resolve }) : resolve(false)))
}
/** Tells the person something and waits for OK. */
export function alertDialog(o: DialogOptions | string): Promise<void> {
  return new Promise((resolve) => (wake ? push({ ...opts(o), kind: 'alert', resolve }) : resolve()))
}
/** Asks for a line of text; null when cancelled. */
export function promptDialog(o: (DialogOptions & { value?: string; placeholder?: string }) | string): Promise<string | null> {
  return new Promise((resolve) => (wake ? push({ ...opts(o), kind: 'prompt', resolve }) : resolve(null)))
}

export function DialogHost() {
  const [cur, setCur] = useState<Req | null>(null)
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const before = useRef<Element | null>(null)
  const titleId = useId()
  const msgId = useId()
  useEffect(() => {
    const next = () =>
      setCur((c) => {
        if (c || !queue.length) return c
        const r = queue.shift()!
        before.current = document.activeElement
        setText(r.kind === 'prompt' ? r.value ?? '' : '')
        return r
      })
    wake = next
    next()
    return () => {
      wake = null
    }
  }, [])
  const done = (ok: boolean) => {
    if (!cur) return
    if (cur.kind === 'confirm') cur.resolve(ok)
    else if (cur.kind === 'prompt') cur.resolve(ok ? text : null)
    else cur.resolve()
    setCur(null)
    ;(before.current as HTMLElement | null)?.focus?.()
    queueMicrotask(() => wake?.())
  }
  useEffect(() => {
    if (!cur) return
    const first = box.current?.querySelector<HTMLElement>(cur.kind === 'prompt' ? 'input' : cur.danger ? '[data-cancel]' : '[data-ok]')
    first?.focus()
  }, [cur])
  if (!cur) return null
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      done(false)
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      done(true)
    } else if (e.key === 'Tab') {
      // focus stays inside the dialog
      const f = [...(box.current?.querySelectorAll<HTMLElement>('button, input') ?? [])]
      const i = f.indexOf(document.activeElement as HTMLElement)
      const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1
      e.preventDefault()
      f[n]?.focus()
    }
  }
  return (
    <div className="overlay ui-dialog-overlay" onMouseDown={(e) => e.target === e.currentTarget && cur.kind !== 'alert' && done(false)}>
      <div ref={box} className="ui-dialog" role={cur.kind === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={cur.title ? titleId : undefined} aria-label={cur.title ? undefined : cur.kind === 'alert' ? 'Notice' : 'Confirm'} aria-describedby={msgId} onKeyDown={onKey}>
        {cur.title && <div className="ui-dialog-title" id={titleId}>{cur.title}</div>}
        <div className="ui-dialog-msg" id={msgId}>{cur.message}</div>
        {cur.kind === 'prompt' && <input className="ui-dialog-input" value={text} placeholder={cur.placeholder} spellCheck={false} onChange={(e) => setText(e.target.value)} aria-label={cur.title ?? cur.message} />}
        <div className="ui-dialog-actions">
          {cur.kind !== 'alert' && (
            <button type="button" className="ghost small" data-cancel onClick={() => done(false)}>
              {cur.cancel ?? 'Cancel'}
            </button>
          )}
          <button type="button" className={`small ${cur.danger ? 'danger' : 'primary'}`} data-ok onClick={() => done(true)}>
            {cur.confirm ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
