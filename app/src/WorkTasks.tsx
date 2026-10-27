import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { Meter } from './Chart'
import { byPanel, type WorkTask } from '../shared/worktasks'
import { Checkbox, NumberField } from './ui'

type PanelRef = { sid: string; label: string }

/** Tasks: work that spans panels, with one budget, one timeline and one decision. */
export function WorkTasksSheet(props: { panels: PanelRef[]; focus?: string; onClose: () => void }) {
  const [list, setList] = useState<WorkTask[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [budget, setBudget] = useState('2')
  const [decision, setDecision] = useState('')
  const [err, setErr] = useState('')
  const load = () => void window.stm.wt.list().then((l) => (setList(l), setPick((p) => p ?? l.find((t) => t.status === 'open')?.id ?? null)))
  useEffect(() => (load(), window.stm.wt.onChanged(load)), [])
  const t = list.find((x) => x.id === pick)
  const spentBy = t ? byPanel(t) : {}
  const act = (p: Promise<unknown>) => void p.then(load, (e) => setErr(clean(e)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Tasks">
        <header className="sheet-head">
          <div className="sheet-title">Tasks</div>
          <span className="faint">one budget and one timeline across panels</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ex-grid mf-grid">
          <div className="ex-col">
            <span className="chart-name">New task</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pix at checkout" aria-label="Task title" />
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What done looks like" aria-label="Task goal" />
            <div className="ob-row">
              <label className="se-num">Budget US$ <NumberField min={0} step={0.5} value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
              <span className="spacer-flex" />
              <button className="primary" disabled={!title.trim()} onClick={() => act(window.stm.wt.create(title, goal, Number(budget), props.focus).then((x) => (setPick(x.id), setTitle(''), setGoal(''))))}>Open{props.focus ? ' with this panel' : ''}</button>
            </div>
            <span className="chart-name">Tasks</span>
            {list.length === 0 && <div className="faint">None yet.</div>}
            {list.map((x) => (
              <button key={x.id} className={`wt-row ${x.id === pick ? 'on' : ''} ${x.status}`} onClick={() => setPick(x.id)}>
                <b>{x.title}</b>
                <span className="faint">US$ {x.spent.toFixed(2)}{x.budgetUsd ? ` of ${x.budgetUsd.toFixed(2)}` : ''} · {x.sids.length} panel{x.sids.length === 1 ? '' : 's'}{x.status === 'done' ? ' · done' : ''}</span>
              </button>
            ))}
          </div>
          {t ? (
            <div className="ex-col">
              <div className="ob-row"><b className="ob-grow wt-title">{t.title}</b><span className={`pb-state ${t.status === 'done' ? 'done' : 'running'}`}>{t.status}</span></div>
              {t.goal && <div className="faint">{t.goal}</div>}
              {t.budgetUsd > 0 ? <Meter label="Budget" value={t.spent} max={t.budgetUsd} unit="US$" /> : <div className="faint">No budget: spend is counted, nothing holds.</div>}
              <div className="ob-row">
                <label className="se-num">Budget US$ <NumberField min={0} step={0.5} defaultValue={t.budgetUsd} key={t.id + t.budgetUsd} onBlur={(e) => Number(e.target.value) !== t.budgetUsd && act(window.stm.wt.budget(t.id, Number(e.target.value)))} /></label>
              </div>
              <span className="chart-name">Panels</span>
              {props.panels.map((p) => {
                const on = t.sids.includes(p.sid)
                return (
                  <label key={p.sid} className="ca-toggle">
                    <Checkbox checked={on} disabled={t.status === 'done'} onChange={(e) => act(window.stm.wt.link(t.id, p.sid, e.target.checked))} />
                    {p.label}{spentBy[p.sid] ? <span className="faint"> · US$ {spentBy[p.sid]!.toFixed(2)}</span> : null}
                  </label>
                )
              })}
              <span className="chart-name">Timeline</span>
              <ol className="wt-time">
                {[...t.events].reverse().slice(0, 60).map((e, i) => (
                  <li key={i} className={`wt-${e.kind}`}><span className="faint">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> {e.text}{e.usd ? <span className="faint"> US$ {e.usd.toFixed(3)}</span> : null}</li>
                ))}
              </ol>
              {t.status === 'open' ? (
                <div className="ob-row">
                  <input className="ob-grow" value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="The decision: merged, dropped, what was learned" aria-label="Decision" />
                  <button onClick={() => act(window.stm.wt.decide(t.id, decision).then(() => setDecision('')))}>Close the task</button>
                </div>
              ) : <div className="notice">Decision: {t.decision || 'Closed.'}</div>}
              {err && <div className="notice error">{err}</div>}
            </div>
          ) : <div className="ex-col faint">Open a task, then add panels to it. Their turns count against its budget; at 100% they all hold.</div>}
        </div>
      </div>
    </div>
  )
}
