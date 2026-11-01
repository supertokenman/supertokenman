import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { IconClose, IconSend, IconStop } from '../icons'
import { Markdown } from '../markdown'
import { StateMark } from '../StateMark'
import { noPanels, reducePanels, type Action, type Ask, type PanelAction } from '../state'
import type { PilotAction } from '../bridge'
import { parseCard, reasonText, smallestModel, TIER_WORDS, lastUndoable } from './logic'
import { PilotActions } from './PilotActions'
import './pilot.css'

// each one is a real request the Pilot can do now: a command it runs, or something it reads
const START: [string, string][] = [
  ['Switch to the 2x2 layout', 'Runs a command'],
  ['Open Today', 'Runs a command'],
  ['What did I spend today?', 'Reads'],
  ['Which routines run next?', 'Reads'],
  ['What notifications did I miss?', 'Reads'],
]

/** One confirm card: the command, its arguments, its tier, and "cannot be undone" before you allow it. */
function PilotCard(props: { ask: Ask; onAnswer: (allow: boolean) => void }) {
  const { ask, onAnswer } = props
  const card = parseCard(ask.summary)
  return (
    <div className="pilot-card" role="group" aria-label={card ? `Confirm: ${card.title}` : 'Permission'}>
      <div className="pilot-card-head">
        <StateMark state={card?.tier === 'confirm' ? 'down' : 'warn'} label={card ? TIER_WORDS[card.tier] : 'Permission'} />
        <span className="pilot-card-title">{card ? card.title : ask.tool.replace(/^mcp__/, '').replace(/__/g, ' ')}</span>
        {card && <span className="pilot-tag">{card.tier}</span>}
      </div>
      {card ? (
        card.args.length > 0 && (
          <dl className="pilot-args">
            {card.args.map((a) => (
              <div key={a.key}>
                <dt>{a.key}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        )
      ) : (
        <pre className="pilot-cmd">{ask.summary}</pre>
      )}
      {card?.irreversible && <p className="pilot-warn">This cannot be undone.</p>}
      {ask.why && <p className="pilot-why">Asks because it is {ask.why}.</p>}
      <div className="pilot-card-actions">
        <button className="ghost" onClick={() => onAnswer(false)}>Deny</button>
        <button className="primary" autoFocus onClick={() => onAnswer(true)}>Allow</button>
      </div>
    </div>
  )
}

/**
 * The Pilot (spec-pilot.md): a pinned sheet on the right with its own session. The session is started on the
 * first open and kept while the sheet is closed, so it keeps the conversation.
 */
export default function Pilot(props: { open: boolean; onClose: () => void }) {
  const [p, dispatch] = useReducer((st: ReturnType<typeof reducePanels>, a: PanelAction) => reducePanels(st, a), noPanels)
  const sid = p.order[0]
  const s = sid ? p.byId[sid] : undefined
  const sidRef = useRef<string | undefined>(sid)
  sidRef.current = sid
  const starting = useRef(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [tainted, setTainted] = useState(false)
  const [actions, setActions] = useState<PilotAction[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [undoing, setUndoing] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const box = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  const start = useCallback(async () => {
    if (starting.current) return
    starting.current = true
    setError('')
    try {
      const model = smallestModel().id
      const r = await window.stm.newSession({ model, pilot: true })
      dispatch({ kind: 'open', sid: r.sid, cwd: r.cwd, model })
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      starting.current = false
    }
  }, [])

  useEffect(() => {
    if (props.open && !sid) void start()
  }, [props.open, sid, start])
  useEffect(() => window.stm.onEvent((id, action) => id === sidRef.current && dispatch({ kind: 'event', sid: id, action: action as Action })), [])

  const refresh = useCallback(() => {
    void window.stm.pilot.actions().then(setActions, () => undefined)
    setNow(Date.now())
  }, [])
  useEffect(() => {
    refresh()
    return window.stm.pilot.onChanged(refresh)
  }, [refresh])
  // the badge follows the session: it can turn untrusted after any tool result
  useEffect(() => {
    if (sid) void window.stm.pilot.status(sid).then((r) => setTainted(r.tainted), () => undefined)
  }, [sid, s?.lines.length, s?.busy])
  useEffect(() => {
    if (!props.open) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [props.open])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [s?.lines.length, s?.streaming, s?.asks.length])
  useEffect(() => {
    if (props.open) requestAnimationFrame(() => box.current?.focus())
  }, [props.open, sid])

  const send = (text: string) => {
    const t = text.trim()
    if (!t || !sid || s?.busy) return
    setDraft('')
    dispatch({ kind: 'event', sid, action: { kind: 'sent', text: t, at: Date.now() } })
    void window.stm.send(sid, t)
  }
  const answer = (id: string, allow: boolean) => {
    if (!sid) return
    dispatch({ kind: 'event', sid, action: { kind: 'answered', id } })
    void window.stm.answer(sid, id, allow)
  }
  const undo = async (id: string) => {
    if (undoing) return
    setUndoing(id)
    const r = await window.stm.pilot.undo(id).catch(() => ({ ok: false, reason: 'failed' as const }))
    setNotes((n) => ({ ...n, [id]: r.ok ? '' : reasonText(r.reason) }))
    setUndoing(null)
    refresh()
  }
  const fresh = () => {
    if (sid) {
      void window.stm.closeSession(sid)
      dispatch({ kind: 'close', sid })
      setTainted(false)
    }
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    // another sheet on top takes the Escape (it closes itself); the Pilot stays
    if (e.key === 'Escape') return document.querySelector('.overlay [role=dialog]') ? undefined : props.onClose()
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      const last = lastUndoable(actions)
      if (last) void undo(last.id)
    }
  }

  const lines = s?.lines ?? []
  return (
    <aside className="pilot" hidden={!props.open} role="dialog" aria-label="Pilot" aria-modal="false" onKeyDown={onKeyDown}>
      <div className="pilot-in">
        <header className="pilot-head">
          <StateMark state={s?.busy ? 'busy' : 'up'} label={s?.busy ? 'Working' : 'Ready'} />
          <h2>Pilot</h2>
          {tainted && (
            <span className="pilot-untrusted" data-tip="This session read files, web pages or shell output. Until you start a new chat, commands that need your approval always show a card, whatever your rules say.">
              <StateMark state="warn" label="Untrusted content" /> Read untrusted content
            </span>
          )}
          <span className="pilot-head-end">
            {lines.length > 0 && <button className="ghost small" onClick={fresh}>New chat</button>}
            <button className="ghost icon" onClick={props.onClose} aria-label="Close the Pilot (Escape)" data-tip="Close (Escape)"><IconClose /></button>
          </span>
        </header>

        <div className="pilot-feed" role="log" aria-live="polite" aria-label="Conversation with the Pilot">
          {error ? (
            <div className="pilot-empty">
              <p className="pilot-err">{error}</p>
              <button onClick={() => void start()}>Try again</button>
            </div>
          ) : lines.length === 0 && !s?.streaming ? (
            <div className="pilot-empty">
              <p className="pilot-lede">Ask the Pilot to run the app for you: change the layout, open a screen, read what it cost today. Anything that spends money or changes the machine asks you first, and you can undo what it did.</p>
              <ul className="pilot-starts" aria-label="Things to ask">
                {START.map(([t, kind]) => (
                  <li key={t}>
                    <button disabled={!sid} onClick={() => send(t)}>
                      <span>{t}</span>
                      <span className="pilot-start-kind">{kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            lines.map((l, i) =>
              l.kind === 'user' ? (
                <div key={i} className="pilot-msg user">{l.text}</div>
              ) : l.kind === 'assistant' ? (
                <div key={i} className="pilot-msg"><Markdown text={l.text} /></div>
              ) : l.kind === 'tool' ? (
                <div key={i} className="pilot-step"><code>{l.name.replace(/^mcp__(stm|panels)__/, '')}</code> {l.summary}</div>
              ) : l.kind === 'note' && l.tone === 'error' ? (
                <div key={i} className={`pilot-note ${l.tone ?? ''}`}>{l.text}</div>
              ) : null,
            )
          )}
          {s?.streaming && (
            <div className="pilot-msg">
              <Markdown text={s.streaming} live />
            </div>
          )}
          {s?.asks.map((a) => <PilotCard key={a.id} ask={a} onAnswer={(allow) => answer(a.id, allow)} />)}
          <div ref={end} />
        </div>

        <form className="pilot-compose cutfields" onSubmit={(e) => (e.preventDefault(), send(draft))}>
          <textarea
            ref={box}
            rows={2}
            value={draft}
            aria-label="Ask the Pilot"
            placeholder={sid ? 'Ask the Pilot to do something in the app' : 'Starting…'}
            disabled={!sid}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(draft)
              }
            }}
          />
          {s?.busy ? (
            <button type="button" className="send stop" aria-label="Stop" data-tip="Stop" onClick={() => sid && void window.stm.interrupt(sid)}><IconStop /></button>
          ) : (
            <button type="submit" className="primary send" aria-label="Send" data-tip="Send (Enter)" disabled={!draft.trim() || !sid}><IconSend /></button>
          )}
        </form>

        <PilotActions actions={actions} notes={notes} busy={undoing} now={now} onUndo={(id) => void undo(id)} />
      </div>
    </aside>
  )
}
