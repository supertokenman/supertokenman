import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { Markdown } from './markdown'
import { StateMark } from './StateMark'
import { useLocalStream } from './localStream'

type Turn = { role: 'user' | 'assistant'; content: string }

/**
 * Quick ask: a conversation with the local model alone. Free, private (nothing leaves the Mac) and it
 * works offline. For quick questions; anything that needs the project goes to a panel.
 */
export function LocalAskSheet(props: { onClose: () => void; onOpenLocal: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState<string | null | undefined>(undefined)
  const s = useLocalStream()
  const end = useRef<HTMLDivElement>(null)
  // the stream's text as of the last render, read once the answer ends
  const lastText = useRef('')
  lastText.current = s.text
  useEffect(() => {
    void window.stm.local.status().then((st) => setModel(st.model && st.version ? st.model : null))
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (s.busy ? s.stop() : props.onClose())
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props, s])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, s.text])

  const send = async () => {
    const q = draft.trim()
    if (!q || s.busy) return
    const next = [...turns, { role: 'user' as const, content: q }]
    setTurns(next)
    setDraft('')
    const r = await s.run([{ role: 'system', content: 'You are a helpful assistant inside a developer app. Answer briefly and concretely; use Markdown for code.' }, ...next], 'chat')
    await new Promise((ok) => setTimeout(ok, 30))
    setTurns((t) => [...t, { role: 'assistant', content: r.error ? `**Failed:** ${r.error}` : lastText.current || (r.stopped ? '_Stopped._' : '') }])
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet lask" role="dialog" aria-label="Quick ask">
        <header className="sheet-head">
          <div className="sheet-title">Quick ask</div>
          <span className="faint">On this Mac, free, private, works offline</span>
          <span className="spacer-flex" />
          {model && <span className="lask-model"><StateMark state={s.busy ? 'busy' : 'up'} label={s.busy ? 'Answering' : 'Ready'} />{model}</span>}
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="lask-body">
          {model === null ? (
            <div className="lask-empty">
              <StateMark state="off" size="md" label="No local model" />
              <div>No local model is ready. Set one up in Local model; it takes a few minutes and is free.</div>
              <button className="primary small" onClick={props.onOpenLocal}>Open Local model</button>
            </div>
          ) : turns.length === 0 ? (
            <div className="lask-empty faint">Ask anything quick: a regex, a command, what an error means, a name for a function. It stays on this Mac.</div>
          ) : (
            turns.map((t, i) =>
              t.role === 'user' ? (
                <div key={i} className="lask-q">{t.content}</div>
              ) : (
                <div key={i} className="lask-a msg assistant"><Markdown text={t.content} /></div>
              ),
            )
          )}
          {s.busy && turns[turns.length - 1]?.role === 'user' && (
            <div className="lask-a msg assistant"><Markdown text={s.text || ' '} /><span className="caret" /></div>
          )}
          <div ref={end} />
        </div>
        <form className="lask-input" onSubmit={(e) => (e.preventDefault(), void send())}>
          <span className="lask-mark">›</span>
          <input autoFocus value={draft} disabled={!model} placeholder={model ? 'Ask the local model' : 'Set up a local model first'} onChange={(e) => setDraft(e.target.value)} />
          {s.busy ? <button type="button" className="small" onClick={s.stop}>Stop</button> : <button className="primary small" disabled={!draft.trim() || !model}>Ask</button>}
        </form>
      </div>
    </div>
  )
}
