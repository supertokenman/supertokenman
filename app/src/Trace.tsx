import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { whyCost, type ContextPart, type TraceTurn } from '../shared/trace'
import { StateMark } from './StateMark'
import './bridge'

const close = (
  <IconClose />
)

/**
 * The trace of a panel: what its system prompt is made of, part by part with its size, and for each
 * turn why it came here, which tools ran and what it cost. Explains a surprising answer or bill.
 */
export function TraceSheet(props: { sid?: string; name: string; money: (usd: number) => string; onClose: () => void }) {
  const [data, setData] = useState<{ parts: ContextPart[]; turns: TraceTurn[] } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [rc, setRc] = useState<{ count: number; brokenAt: number | null; signed: boolean } | null>(null)
  useEffect(() => void window.stm.receipts().then(setRc), [])
  useEffect(() => {
    if (!props.sid) return
    const read = () => void window.stm.trace(props.sid!).then(setData)
    read()
    const t = setInterval(read, 2000)
    return () => clearInterval(t)
  }, [props.sid])
  const total = data?.parts.reduce((n, p) => n + p.tokens, 0) ?? 0
  const part = data?.parts.find((p) => p.name === open)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet trace" role="dialog" aria-label="Trace">
        <header className="sheet-head">
          <div className="sheet-title">Trace</div>
          <span className="faint">{props.name}</span>
          {rc && rc.count > 0 && (
            <span className={`tr-receipts ${rc.brokenAt ? 'bad' : ''}`} title="Every tool call is kept in a log chained with a key from your vault; an edited or removed line breaks the chain">
              <StateMark state={rc.brokenAt ? 'down' : 'up'} label={rc.brokenAt ? 'Edited' : 'Intact'} />
              {rc.brokenAt ? `Tool log edited at line ${rc.brokenAt} of ${rc.count}` : `Tool log intact · ${rc.count} ${rc.count === 1 ? 'call' : 'calls'}${rc.signed ? '' : ' · unsigned, no vault'}`}
            </span>
          )}
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {!props.sid && <div className="note sp-body">Open a panel first.</div>}
        {data && (
          <div className="tr-body">
            <section>
              <div className="sp-label">What the app adds to the system prompt · about {total.toLocaleString('en-US')} tokens</div>
              <div className="tr-parts">
                {data.parts.map((p) => (
                  <button key={p.name} className={`tr-part ${open === p.name ? 'on' : ''}`} onClick={() => setOpen(open === p.name ? null : p.name)}>
                    <span className="tr-part-name">{p.name}</span>
                    <span className="tr-bar"><i style={{ width: `${Math.max(2, (p.tokens / Math.max(1, total)) * 100)}%` }} /></span>
                    <span className="tr-num">{p.tokens.toLocaleString('en-US')}</span>
                  </button>
                ))}
              </div>
              {part && <pre className="tr-text">{part.text}</pre>}
              <div className="faint">Claude Code's own prompt and tool list come on top of this. The parts are fixed for the life of the panel, so the cache keeps them.</div>
            </section>
            <section>
              <div className="sp-label">Turns · newest first</div>
              {data.turns.length === 0 && <div className="faint">No turns yet.</div>}
              <div className="tr-turns">
                {data.turns.map((t) => (
                  <div key={t.at} className={`tr-turn ${t.isError ? 'bad' : ''}`}>
                    <div className="tr-turn-top">
                      <span className="tr-time">{new Date(t.at).toLocaleTimeString()}</span>
                      <span className="tr-prompt">{t.prompt || '(no text)'}</span>
                      <b className="tr-cost">{props.money(t.costUsd)}</b>
                      <button className="ghost small tr-copy" title="Copies this turn as JSON, with its id (the same id is on each of its calls in the tool log)" onClick={() => void navigator.clipboard.writeText(JSON.stringify(t, null, 2)).catch(() => undefined)}>{t.id ?? 'Copy'}</button>
                    </div>
                    <div className="tr-meta">
                      <span>Why here: {t.why ?? 'typed in this panel'}</span>
                      {t.persona && <span>Persona: {t.persona}</span>}
                      {t.goal && <span>Goal: {t.goal}</span>}
                      {t.model && <span>Model: {t.model}</span>}
                      {t.ms !== undefined && <span>{(t.ms / 1000).toFixed(1)}s</span>}
                    </div>
                    <div className="tr-meta">
                      <span>{whyCost(t)}</span>
                      {t.tools.length > 0 && <span className="tr-tools">{t.tools.map((x) => x.replace(/^mcp__([^_]+)__/, '$1 · ')).join(', ')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
