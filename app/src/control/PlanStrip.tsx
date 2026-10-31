import { useEffect, useState } from 'react'
import './control.css'
import type { Plan } from '../../shared/planview'
import { planSummary } from '../../shared/controlview'

const Mark = ({ s }: { s: string }) => (
  <svg viewBox="0 0 10 10" aria-hidden="true">{s === 'completed' ? <path d="M1 1h8v5L6 9H1Z" /> : s === 'in_progress' ? <path d="M1 1h8v8H1Z" /> : <rect x="1.5" y="1.5" width="7" height="7" />}</svg>
)
const LABEL = { pending: 'Not started', in_progress: 'In progress', completed: 'Done' } as const

/** The panel's plan under its header: items with their status and the agent and fan-out counters. In a canvas node it is one line. */
export default function PlanStrip(props: { sid: string; compact?: boolean }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    setPlan(null)
    window.stm.control.planGet(props.sid).then((p) => live && setPlan(p), () => undefined)
    const off = window.stm.onEvent((sid, e) => {
      const ev = e as { kind?: string; plan?: Plan }
      if (sid === props.sid && ev.kind === 'plan' && ev.plan) setPlan(ev.plan)
    })
    return () => (live = false, off())
  }, [props.sid])
  if (!plan) return null
  const sum = planSummary(plan)
  if (!sum.total && !plan.agents.used && !plan.fanout.used) return null
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0
  return (
    <section className={`plan-strip${props.compact ? ' compact' : ''}`} aria-label="Plan">
      <div className="plan-top">
        <button className="plan-toggle" aria-expanded={open} disabled={!sum.total} onClick={() => setOpen(!open)} data-tip={sum.total ? (open ? 'Hide the plan' : 'Show the plan') : undefined}>
          <span className="plan-n">{sum.total ? `${sum.done}/${sum.total}` : 'No plan'}</span>
          <span className="plan-cur">{sum.current ?? (sum.total && sum.done === sum.total ? 'All done' : sum.total ? 'Next item waiting' : '')}</span>
        </button>
        {!props.compact && (
          <>
            <span className={`plan-meter${plan.agents.used >= plan.agents.cap ? ' full' : ''}`} data-tip="Subagents started in this run, of the most allowed. At the limit the next one asks.">agents {plan.agents.used}/{plan.agents.cap}</span>
            <span className={`plan-meter${plan.fanout.used >= plan.fanout.cap ? ' full' : ''}`} data-tip="Panels this run started, of the most allowed. At the limit the next one asks.">fan-out {plan.fanout.used}/{plan.fanout.cap}</span>
          </>
        )}
      </div>
      {sum.total > 0 && <div className="plan-bar" role="progressbar" aria-label="Plan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>}
      {open && !props.compact && (
        <ol className="plan-items">
          {plan.items.map((it, i) => (
            <li key={i} className={it.status}><Mark s={it.status} /><span><span className="sr-only">{LABEL[it.status]}: </span>{it.text}</span></li>
          ))}
        </ol>
      )}
    </section>
  )
}
