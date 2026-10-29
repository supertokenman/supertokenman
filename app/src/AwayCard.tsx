import { useEffect, useState } from 'react'
import type { AwayCard as Card } from './bridge'
import { IconClose } from './icons'
import { Switch } from './ui'

/** What happened while the person was away, from the app's own log of turns, approvals, trigger runs and errors. */
export function AwayCard(props: { card: Card; onClose: () => void }) {
  const [on, setOn] = useState(props.card.on)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet ports" role="dialog" aria-label="While you were away">
        <header className="sheet-head">
          <div className="sheet-title">{props.card.title}</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="sheet-body">
          <ul>{props.card.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          {msg && <p>{msg}</p>}
          {props.card.canSpeak && <button className="ghost small" onClick={() => void window.stm.away.say().then(() => setMsg(''), (e: Error) => setMsg(e.message))}>Read aloud</button>}
          <p>
            <label className="faint">
              <Switch checked={on} onChange={(e) => void window.stm.away.setCard(e.target.checked).then(setOn)} /> Show this after an hour away
            </label>
          </p>
        </div>
      </div>
    </div>
  )
}
