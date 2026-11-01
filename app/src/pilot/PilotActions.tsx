import type { PilotAction } from '../bridge'
import { StateMark } from '../StateMark'
import { ago, lastUndoable } from './logic'

/** What the Pilot did, newest first, with an undo per row. `notes` holds why an undo was refused. */
export function PilotActions(props: { actions: PilotAction[]; notes: Record<string, string>; busy: string | null; now: number; onUndo: (id: string) => void }) {
  const { actions, notes, busy, now, onUndo } = props
  const last = lastUndoable(actions)
  return (
    <section className="pilot-actions" aria-label="What the Pilot did">
      <div className="pilot-actions-head">
        <h3>Actions</h3>
        <span className="pilot-count">{actions.length}</span>
        <button className="ghost small" disabled={!last || busy !== null} onClick={() => last && onUndo(last.id)} data-tip="Undo the newest action that can be undone (Cmd+Shift+Z here)">
          Undo last
        </button>
      </div>
      {actions.length === 0 ? (
        <p className="pilot-none">Nothing yet. What the Pilot runs in the app is listed here, and you can undo it.</p>
      ) : (
        <ul className="pilot-rows">
          {actions.map((a) => (
            <li key={a.id} className="pilot-row">
              <div className="pilot-row-main">
                <span className="pilot-row-title">{a.title}</span>
                <span className="pilot-row-meta">
                  <code>{a.command}</code> {ago(a.at, now)}
                </span>
              </div>
              {a.irreversible ? (
                <span className="pilot-row-state"><StateMark state="down" label="Cannot be undone" /> Cannot be undone</span>
              ) : a.undo ? (
                <button className="small" disabled={busy !== null} onClick={() => onUndo(a.id)} aria-label={`Undo: ${a.title}`}>
                  {busy === a.id ? 'Undoing…' : 'Undo'}
                </button>
              ) : (
                <span className="pilot-row-state faint">Nothing to undo</span>
              )}
              {notes[a.id] && <p className="pilot-row-note" role="status">{notes[a.id]}</p>}
            </li>
          ))}
        </ul>
      )}
      <dl className="pilot-legend" aria-label="Tiers">
        <div><dt><StateMark state="up" label="Free" /> Free</dt><dd>runs at once</dd></div>
        <div><dt><StateMark state="warn" label="Ask" /> Ask</dt><dd>shows you a card</dd></div>
        <div><dt><StateMark state="down" label="Confirm" /> Confirm</dt><dd>always asks</dd></div>
      </dl>
    </section>
  )
}
