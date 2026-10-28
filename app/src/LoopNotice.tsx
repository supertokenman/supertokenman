import { useState } from 'react'
import { StateMark } from './StateMark'
import type { State } from './state'

/** What Continue sends: the turn was interrupted, so the agent picks up where it stopped. */
export const LOOP_CONTINUE = 'Continue where you stopped.'

/** The loop guard paused this panel's agent: what repeated, what the repeats cost, and three ways on. */
type Props = { loop: NonNullable<State['loop']>; money: (usd: number) => string; onContinue: () => void; onQuiet: () => void }
export function LoopNotice(props: Props) {
  const [open, setOpen] = useState(false)
  return <LoopNoticeView {...props} open={open} onToggle={() => setOpen(!open)} />
}

/** The notice itself, without state (tests render it directly). */
export function LoopNoticeView(props: Props & { open: boolean; onToggle: () => void }) {
  const { open } = props
  const l = props.loop
  const tokens = new Intl.NumberFormat('en-US').format(Math.round(l.tokens))
  return (
    <div className="ask held-card loop-card" role="alert">
      <div className="ask-head">
        <StateMark state="warn" label="Paused" />
        <span className="ask-label">Going in circles</span>
      </div>
      <p className="held-why">
        {l.reason} Those repeats cost about {props.money(l.usd)} ({tokens} tokens).
      </p>
      {open && (
        <ol className="loop-steps" aria-label="The repeated steps">
          {l.steps.map((st, i) => (
            <li key={i}>
              <span className="loop-tool">{st.kind === 'error' ? `${st.tool} error` : st.tool}</span> <code>{st.label || '(no input)'}</code>
            </li>
          ))}
        </ol>
      )}
      <div className="ask-actions">
        <button className="ghost" aria-expanded={open} onClick={props.onToggle}>{open ? 'Hide the repeats' : 'Show the repeats'}</button>
        <button className="ghost" onClick={props.onQuiet}>Continue and don't pause again in this session</button>
        <button className="primary" onClick={props.onContinue}>Continue</button>
      </div>
    </div>
  )
}
