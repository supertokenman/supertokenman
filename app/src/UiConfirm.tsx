import { useEffect } from 'react'
import { IconClose } from './icons'

export type UiItem = { folder: string; title?: string; persona?: string; model?: string }

/** A panel's Claude wants to open panels: each one starts a session that costs tokens, so nothing opens before Allow. */
export function UiConfirm(props: { from: string; items: UiItem[]; onAnswer: (allow: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onAnswer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onAnswer])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onAnswer(false)}>
      <div className="sheet ports" role="dialog" aria-label="Allow panels">
        <header className="sheet-head">
          <div className="sheet-title">{props.from} asks to open {props.items.length === 1 ? 'a panel' : `${props.items.length} panels`}</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Deny" onClick={() => props.onAnswer(false)}><IconClose /></button>
        </header>
        <div className="sheet-body">
          <p className="faint">Each panel starts a new Claude session, which uses tokens. Nothing opens until you press Allow.</p>
          <ul>
            {props.items.map((it, i) => (
              <li key={i}>
                <strong>{it.title ?? it.folder.split('/').filter(Boolean).slice(-1)[0] ?? it.folder}</strong> <span className="faint">{it.title ? `${it.folder} ` : ''}{it.persona ? `persona ${it.persona} ` : ''}{it.model ?? ''}</span>
              </li>
            ))}
          </ul>
          <button className="primary" autoFocus onClick={() => props.onAnswer(true)}>Allow</button>{' '}
          <button className="ghost" onClick={() => props.onAnswer(false)}>Deny</button>
        </div>
      </div>
    </div>
  )
}
