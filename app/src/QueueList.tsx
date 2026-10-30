import { useEffect, useRef, useState } from 'react'
import type { QueueView } from './bridge'
import type { QueueItem } from '../shared/panelqueue'
import { IconClose } from './icons'

/** The queue under the composer: what was sent while a turn ran, in the order it goes out. Loaded when a queue is not empty. */
export default function QueueList(props: { sid: string; money: (usd: number) => string }) {
  const { sid } = props
  const [view, setView] = useState<QueueView | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [steering, setSteering] = useState<string | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    void window.stm.queue.get(sid).then((v) => live && setView(v), () => undefined)
    const off = window.stm.queue.onChanged((id, v) => id === sid && setView(v))
    return () => {
      live = false
      off()
    }
  }, [sid])
  const act = (a: Parameters<typeof window.stm.queue.act>[1]) => window.stm.queue.act(sid, a).then(setView, (e: Error) => setErr(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  if (!view || !view.queue.items.length) return null
  const { queue, estimate } = view
  const waiting = queue.items.filter((x) => x.state === 'waiting')
  const first = queue.items.findIndex((x) => x.state === 'waiting')

  return (
    <div className="queue" role="region" aria-label="Queued messages">
      <div className="queue-head">
        <b>Queue</b>
        <span className="faint">{waiting.length} waiting{queue.paused ? ', paused' : ''}</span>
        {estimate.turns >= 3 && (
          <span className="faint queue-cost" data-tip="The median of this panel's last turns times the turns waiting">
            {estimate.usd === null ? `${estimate.turns} turns, cost unknown` : `about ${props.money(estimate.usd)} for ${estimate.turns} turns`}
          </span>
        )}
        <span className="spacer-flex" />
        {queue.paused ? (
          <button className="small primary" onClick={() => void act({ t: 'resume' })}>Resume</button>
        ) : (
          <button className="ghost small" onClick={() => void act({ t: 'pause' })}>Pause</button>
        )}
      </div>
      {queue.paused && queue.pauseReason && <div className="queue-why faint">{queue.pauseReason}</div>}
      {err && <div className="queue-why queue-err" role="alert">{err}</div>}
      <ol className="queue-items">
        {queue.items.map((it, i) => (
          <Row
            key={it.id}
            it={it}
            index={i}
            first={i === first}
            last={i === queue.items.length - 1}
            editing={editing?.id === it.id ? editing.text : null}
            steering={steering === it.id}
            onEdit={(text) => setEditing(text === null ? null : { id: it.id, text })}
            onSave={() => {
              if (editing) void act({ t: 'edit', id: it.id, text: editing.text })
              setEditing(null)
            }}
            onCancel={() => void act({ t: 'cancel', id: it.id })}
            onMove={(to) => void act({ t: 'move', id: it.id, to })}
            onSteerOpen={() => setSteering(steering === it.id ? null : it.id)}
            onSteer={(mode) => {
              setSteering(null)
              void act({ t: 'steer', id: it.id, mode })
            }}
          />
        ))}
      </ol>
    </div>
  )
}

function Row(props: {
  it: QueueItem
  index: number
  first: boolean
  last: boolean
  editing: string | null
  steering: boolean
  onEdit: (text: string | null) => void
  onSave: () => void
  onCancel: () => void
  onMove: (to: number) => void
  onSteerOpen: () => void
  onSteer: (mode: 'next' | 'interrupt') => void
}) {
  const { it } = props
  const sending = it.state === 'sending'
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (props.editing !== null) box.current?.focus()
  }, [props.editing === null])
  return (
    <li className={`queue-item${sending ? ' sending' : ''}`}>
      <span className="queue-n faint">{props.index + 1}</span>
      {props.editing !== null ? (
        <div className="queue-edit">
          <textarea
            ref={box}
            rows={2}
            value={props.editing}
            aria-label="Edit the queued message"
            onChange={(e) => props.onEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                props.onEdit(null)
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                props.onSave()
              }
            }}
          />
          <div className="queue-acts">
            <button className="small primary" disabled={!props.editing.trim()} onClick={props.onSave}>Save</button>
            <button className="ghost small" onClick={() => props.onEdit(null)}>Discard</button>
          </div>
        </div>
      ) : (
        <>
          <span className="queue-text" data-tip={it.text.length > 200 ? it.text.slice(0, 600) : undefined}>{it.text.replace(/\s+/g, ' ').slice(0, 220)}</span>
          {sending && <span className="queue-tag">Sending</span>}
          {!sending && it.steer && <span className="queue-tag steer">{it.steer === 'interrupt' ? 'Steer: stops the turn' : 'Steer: next turn'}</span>}
          {it.askId && !it.askId.startsWith('w:') && <span className="queue-tag">Ask</span>}
          {it.askId?.startsWith('w:') && <span className="queue-tag">Channel</span>}
          {!sending && (
            <span className="queue-acts">
              <button className="ghost small icon" aria-label="Move up" data-tip="Move up" disabled={props.first} onClick={() => props.onMove(props.index - 1)}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6.5L5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button className="ghost small icon" aria-label="Move down" data-tip="Move down" disabled={props.last} onClick={() => props.onMove(props.index + 1)}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5L5 6.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button className="ghost small" onClick={() => props.onEdit(it.text)}>Edit</button>
              <button className="ghost small" aria-expanded={props.steering} data-tip="Go first: at the end of this turn, or stop the turn now" onClick={props.onSteerOpen}>Steer</button>
              <button className="ghost small icon" aria-label="Remove from the queue" data-tip="Remove" onClick={props.onCancel}><IconClose /></button>
            </span>
          )}
          {props.steering && (
            <span className="queue-steer" role="group" aria-label="Steer">
              <button className="small" onClick={() => props.onSteer('next')}>Next turn</button>
              <button className="small" data-tip="Stops the running turn like Stop; the partial turn stays in the transcript" onClick={() => props.onSteer('interrupt')}>Interrupt now</button>
            </span>
          )}
        </>
      )}
    </li>
  )
}
