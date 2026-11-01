import { useEffect, useRef } from 'react'
import { cardText } from './model'
import type { Ask } from './types'

/** The asks of the agent browser: a new host, a download, an upload. Inline cards, never a dialog. */
export function AskCards(props: { asks: Ask[]; names: Record<string, string>; onAnswer: (id: string, answer: 'once' | 'always' | 'deny') => void }) {
  const first = useRef<HTMLDivElement>(null)
  const top = props.asks[0]?.id
  useEffect(() => {
    // a new card is announced and takes focus without taking a button, so Enter cannot answer by accident
    if (top) first.current?.focus()
  }, [top])
  if (!props.asks.length) return null
  return (
    <div className="ab-asks">
      {props.asks.map((a, i) => {
        const t = cardText(a, props.names[a.panel] ?? 'The assistant')
        return (
          <div key={a.id} ref={i === 0 ? first : undefined} className={`ab-ask ${a.kind}`} role="alert" tabIndex={-1} data-ask={a.kind}>
            <div className="ab-ask-title">{t.title}</div>
            <p className="ab-ask-body">{t.body}</p>
            {a.kind === 'host' && !a.detail.always && <p className="ab-ask-note faint">Page text has reached the assistant in this session, so this answer is not saved as a rule.</p>}
            <div className="ab-ask-actions">
              <button className="small primary" onClick={() => props.onAnswer(a.id, 'once')}>{t.yes}</button>
              {t.always && <button className="small" onClick={() => props.onAnswer(a.id, 'always')}>{t.always}</button>}
              <button className="small ghost" onClick={() => props.onAnswer(a.id, 'deny')}>{t.no}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
