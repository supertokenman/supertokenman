import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { clock, hm, roundState, summary, type Focus, type TimeLog } from './focusRound'

const LENGTHS = [25, 50, 90]

/** The ring and clock in the top bar while a round runs. */
export function FocusChip({ f, now, onClick }: { f: Focus; now: number; onClick: () => void }) {
  const r = roundState(f, now)
  const C = 2 * Math.PI * 7
  return (
    <button className={`focus-chip ${f.kind}`} onClick={onClick} title={f.goal || (f.kind === 'break' ? 'Break' : 'Focus')}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" fill="none" />
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray={C} strokeDashoffset={C * r.progress} transform="rotate(-90 9 9)" strokeLinecap="round" />
      </svg>
      <span className="focus-clock">{clock(r.left)}</span>
      <span className="focus-goal">{f.kind === 'break' ? 'Break' : f.goal || 'Focus'}</span>
    </button>
  )
}

/** Start a round, see where it stands, and where today's and this week's time went. */
export function FocusSheet(props: {
  f: Focus | null
  now: number
  log: TimeLog
  panels: { sid: string; name: string }[]
  focusSid: string | null
  onStart: (f: Focus) => void
  onStop: () => void
  onClose: () => void
}) {
  const [goal, setGoal] = useState('')
  const [minutes, setMinutes] = useState(25)
  const [sid, setSid] = useState(props.focusSid ?? props.panels[0]?.sid ?? '')
  const [range, setRange] = useState<1 | 7>(1)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const sum = summary(props.log, props.now, range)
  const max = Math.max(1, ...sum.rows.map((r) => r.you + r.claude))
  const start = () => props.onStart({ goal: goal.trim(), sid: sid || null, startedAt: Date.now(), minutes, kind: 'focus' })

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet focus-sheet" role="dialog" aria-label="Focus">
        <header className="sheet-head">
          <div className="sheet-title">Focus</div>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body">
          {props.f ? (
            <div className="round">
              <div className="round-clock">{clock(roundState(props.f, props.now).left)}</div>
              <div className="round-goal">{props.f.kind === 'break' ? 'Break: step away, the panels keep working.' : props.f.goal || 'No goal set'}</div>
              <div className="round-bar"><span style={{ width: `${roundState(props.f, props.now).progress * 100}%` }} /></div>
              <button className="ghost" onClick={props.onStop}>End {props.f.kind === 'break' ? 'break' : 'round'}</button>
            </div>
          ) : (
            <div className="start">
              <input
                ref={input}
                className="goal"
                placeholder="What is this round for? e.g. caption field in the publish queue"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && start()}
              />
              <div className="start-row">
                <div className="segmented">
                  {LENGTHS.map((m) => (
                    <button key={m} aria-selected={minutes === m} onClick={() => setMinutes(m)}>{m} min</button>
                  ))}
                </div>
                {props.panels.length > 1 && (
                  <label className="select">
                    <span className="select-label">Panel</span>
                    <select value={sid} onChange={(e) => setSid(e.target.value)}>
                      {props.panels.map((p) => (
                        <option key={p.sid} value={p.sid}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="primary" onClick={start}>Start round</button>
              </div>
              <p className="lede">During a round the other panels dim and the coach keeps to what is urgent.</p>
            </div>
          )}

          <div className="time">
            <div className="time-head">
              <span className="group">Where the time went</span>
              <div className="segmented">
                <button aria-selected={range === 1} onClick={() => setRange(1)}>Today</button>
                <button aria-selected={range === 7} onClick={() => setRange(7)}>7 days</button>
              </div>
            </div>
            <div className="time-totals">
              <span><b>{hm(sum.you)}</b> you</span>
              <span><b>{hm(sum.claude)}</b> Claude working</span>
            </div>
            {sum.rows.length === 0 && <div className="faint">Nothing yet. Time is counted while panels are open.</div>}
            {sum.rows.map((r) => (
              <div key={r.project} className="time-row">
                <span className="time-name" title={r.project}>
                  {/* a worktree panel's folder ends in -panel-<id>: the project is the part before it */}
                  {r.project.replace(/-panel-[a-z0-9]+$/i, '')}
                  {/-panel-[a-z0-9]+$/i.test(r.project) && <span className="faint"> worktree</span>}
                </span>
                <span className="time-bars">
                  {r.you > 0 && <span className="you" style={{ width: `max(3px, ${(r.you / max) * 100}%)` }} />}
                  {r.claude > 0 && <span className="claude" style={{ width: `max(3px, ${(r.claude / max) * 100}%)` }} />}
                </span>
                <span className="faint">{hm(r.you + r.claude)}</span>
              </div>
            ))}
            <div className="legend-row">
              <span><i className="sw you" />you</span>
              <span><i className="sw claude" />Claude</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The end of a round: what it came to, and the next step. */
export function RoundDone(props: { f: Focus; turns: number; cost: string; onBreak: () => void; onMore: () => void; onDone: () => void }) {
  return (
    <div className="overlay">
      <div className="sheet round-done" role="dialog" aria-label="Round complete">
        <div className="sheet-body">
          <div className="done-title">{props.f.kind === 'break' ? 'Break over' : 'Round complete'}</div>
          {props.f.kind === 'focus' && (
            <>
              {props.f.goal && <div className="done-goal">{props.f.goal}</div>}
              <div className="done-stats">
                <span><b>{props.f.minutes}</b> min</span>
                <span><b>{props.turns}</b> turns</span>
                <span><b>{props.cost}</b> at API prices</span>
              </div>
            </>
          )}
          <div className="done-actions">
            {props.f.kind === 'focus' ? (
              <>
                <button className="ghost" onClick={props.onDone}>Stop here</button>
                <button onClick={props.onMore}>Another round</button>
                <button className="primary" onClick={props.onBreak}>Take 5</button>
              </>
            ) : (
              <>
                <button className="ghost" onClick={props.onDone}>Close</button>
                <button className="primary" onClick={props.onMore}>Start a round</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
