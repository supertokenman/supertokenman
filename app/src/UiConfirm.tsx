import { useEffect } from 'react'

export type UiItem = { folder: string; title?: string; persona?: string; model?: string }

/** A panel's Claude wants to open panels: each one starts a session that costs tokens, so nothing opens before Allow. */
export function UiConfirm(props: { from: string; items: UiItem[]; onAnswer: (allow: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onAnswer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onAnswer])
  const n = props.items.length
  const home = (f: string) => f.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onAnswer(false)}>
      <div className="ask-card" role="dialog" aria-label="Allow panels" aria-describedby="ask-note">
        <div className="ask-from">From panel {props.from}</div>
        <h2 id="ask-title" className="ask-title">Open {n === 1 ? 'a new panel' : `${n} new panels`}?</h2>
        <ol className="ask-list">
          {props.items.map((it, i) => (
            <li key={i}>
              <span className="ask-name">{it.title ?? it.folder.split('/').filter(Boolean).slice(-1)[0] ?? it.folder}</span>
              <span className="ask-meta">{home(it.folder)}{it.persona ? ` · ${it.persona}` : ''}{it.model ? ` · ${it.model}` : ''}</span>
            </li>
          ))}
        </ol>
        <p id="ask-note" className="ask-note">Each panel is a new Claude session and uses tokens.</p>
        <div className="ask-actions">
          <button className="ghost" onClick={() => props.onAnswer(false)}>Deny</button>
          <button className="primary" autoFocus onClick={() => props.onAnswer(true)}>Allow</button>
        </div>
      </div>
    </div>
  )
}
