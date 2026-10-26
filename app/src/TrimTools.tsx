import { useState } from 'react'
import { createPortal } from 'react-dom'
import { clean } from './errors'

type Plan = Awaited<ReturnType<typeof window.stm.prune.suggest>>

/** Phase 87: leave out the MCP tools a task does not need, so each turn carries fewer tool definitions. */
export function TrimTools(props: { sid: string; task: string; onNote: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const [task, setTask] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pruned, setPruned] = useState(0)
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const run = <T,>(p: Promise<T>, then: (v: T) => void) => {
    setBusy(true)
    void p.then(then, (e) => props.onNote(clean(e))).finally(() => setBusy(false))
  }
  const suggest = (t: string) => run(window.stm.prune.suggest(props.sid, t), (v) => (setPlan(v), setPruned(v.pruned)))
  return (
    <span className="iso-wrap">
      <button className={`ghost small iso-chip ${pruned ? 'on' : ''}`} title="Leave out MCP tools this task does not need" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setAt({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 336) })
        if (!open) { setTask(props.task); setPlan(null) }
        setOpen(!open)
      }}>
        {pruned ? <span key={pruned} className="stamp-in">Tools trimmed · {pruned} off</span> : 'Trim tools'}
      </button>
      {open && createPortal(
        <div className="iso-pop" role="dialog" aria-label="Trim tools" style={{ top: at.top, left: at.left }}>
          <label className="chart-name" htmlFor="tt-task">Task</label>
          <input id="tt-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder="What this panel is working on" />
          {plan && (
            <>
              <div className="faint">{plan.total ? `Keeps ${plan.keep.length} of ${plan.total} MCP tools, saves about ${plan.tokens} tokens a turn.` : 'No MCP tools found to trim.'}</div>
              {plan.failed.length > 0 && <div className="faint">Could not list tools from: {plan.failed.join(', ')}. Those stay on.</div>}
              {plan.off.length > 0 && <ul className="tt-off">{plan.off.map((q) => <li key={q}><code>{q.replace(/^mcp__/, '')}</code></li>)}</ul>}
            </>
          )}
          <div className="ob-row">
            {pruned > 0 && <button disabled={busy} onClick={() => run(window.stm.prune.reset(props.sid), () => (setPruned(0), setOpen(false)))}>Put all back</button>}
            <span className="spacer-flex" />
            <button disabled={busy} onClick={() => suggest(task)}>{busy ? 'Checking...' : 'Suggest'}</button>
            <button className="primary" disabled={busy || !plan?.off.length} onClick={() => plan && run(window.stm.prune.apply(props.sid, plan.off), (n) => (setPruned(n), setOpen(false)))}>Apply</button>
          </div>
        </div>,
        document.body,
      )}
    </span>
  )
}
