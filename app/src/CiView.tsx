import { useState } from 'react'
import { clean, friendly } from './errors'
import type { Job, Run } from '../electron/ci'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const took = (a: string | null, b: string | null) => {
  if (!a || !b) return ''
  const s = Math.round((Date.parse(b) - Date.parse(a)) / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** The state of a run, job or step as one small mark. */
export function Mark({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status !== 'completed') return <span className="ci-mark run" data-tip={status.replace('_', ' ')} role="img" aria-label={status.replace('_', ' ')} />
  const c = conclusion ?? 'neutral'
  return (
    <span className={`ci-mark ${c}`} data-tip={c} role="img" aria-label={c}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        {c === 'success' ? <path d="M2 5.2l2 2 4-4.4" /> : c === 'failure' ? <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /> : <path d="M2.5 5h5" />}
      </svg>
    </span>
  )
}

/** The panel's CI: runs of its branch, their jobs and steps, and what to do about a failure. */
export function CiView(props: { sid: string; ci: { repo: string; branch: string; runs: Run[]; error?: string } | null; onAsk: (text: string) => void }) {
  const { sid, ci } = props
  const [open, setOpen] = useState<number | null>(null)
  const [jobs, setJobs] = useState<Record<number, Job[]>>({})
  const [logs, setLogs] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
    const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(clean(e))
    } finally {
      setBusy('')
    }
  }

  if (!ci) return <div className="note">This folder is not a GitHub repository, or it is still being read.</div>
  const toggle = (r: Run) => {
    if (open === r.id) return setOpen(null)
    setOpen(r.id)
    if (!jobs[r.id]) void act(`jobs-${r.id}`, async () => setJobs({ ...jobs, [r.id]: await window.stm.ciJobs(sid, r.id) }))
  }

  return (
    <div className="ci">
      <div className="ci-head">
        <span className="ci-repo">{ci.repo}</span>
        <span className="badge">{ci.branch}</span>
        <button className="ghost small" onClick={() => void act('refresh', () => window.stm.ciRefresh(sid))}>{busy === 'refresh' ? 'Refreshing...' : 'Refresh'}</button>
      </div>
      {(ci.error || err) && <div className="notice error">{friendly(err || ci.error)}</div>}
      {!ci.error && ci.runs.length === 0 && <div className="note">No workflow runs on {ci.branch} yet.</div>}
      {ci.runs.map((r) => {
        const failed = r.conclusion === 'failure'
        return (
          <div key={r.id} className={`ci-run ${open === r.id ? 'open' : ''}`}>
            <button className="ci-row" onClick={() => toggle(r)}>
              <Mark status={r.status} conclusion={r.conclusion} />
              <span className="ci-title">{r.title}</span>
              <span className="faint">{r.workflow} · {r.sha} · {r.event}{r.attempt > 1 ? ` · attempt ${r.attempt}` : ''}</span>
              <span className="faint ci-when">{ago(r.createdAt)}</span>
            </button>
            {open === r.id && (
              <div className="ci-body">
                <div className="ci-actions">
                  {r.status !== 'completed' && <button className="ghost small" onClick={() => void act('cancel', () => window.stm.ciCancel(sid, r.id))}>Cancel</button>}
                  {failed && <button className="small" onClick={() => void act('rerun', () => window.stm.ciRerun(sid, r.id))}>{busy === 'rerun' ? 'Re-running...' : 'Re-run failed'}</button>}
                  <button className="ghost small" onClick={() => void window.stm.openUrl(r.url)}>Open on GitHub</button>
                </div>
                {busy === `jobs-${r.id}` && <div className="faint">Loading jobs...</div>}
                {(jobs[r.id] ?? []).map((j) => {
                  const badStep = j.steps.find((s) => s.conclusion === 'failure')
                  return (
                    <div key={j.id} className="ci-job">
                      <div className="ci-job-head">
                        <Mark status={j.status} conclusion={j.conclusion} />
                        <span className="ci-job-name">{j.name}</span>
                        <span className="faint">{took(j.startedAt, j.completedAt)}</span>
                        {j.conclusion === 'failure' && !logs[j.id] && (
                          <button className="ghost small" onClick={() => void act(`log-${j.id}`, async () => setLogs({ ...logs, [j.id]: await window.stm.ciLog(sid, j.id) }))}>
                            {busy === `log-${j.id}` ? 'Reading log...' : 'Show error'}
                          </button>
                        )}
                      </div>
                      <div className="ci-steps">
                        {j.steps.map((s) => (
                          <div key={s.number} className={`ci-step ${s.conclusion === 'failure' ? 'bad' : ''}`}>
                            <Mark status={s.status} conclusion={s.conclusion} />
                            {s.name}
                          </div>
                        ))}
                      </div>
                      {logs[j.id] && (
                        <>
                          <pre className="ci-log">{logs[j.id]}</pre>
                          <div className="ci-actions">
                            <button
                              className="primary small"
                              onClick={() =>
                                props.onAsk(
                                  `CI failed on ${ci.repo}, branch ${ci.branch}, commit ${r.sha}: workflow "${r.workflow}", job "${j.name}"${badStep ? `, step "${badStep.name}"` : ''}.\n\nThe lines of the log that explain it:\n\n\`\`\`\n${logs[j.id]}\n\`\`\`\n\nFind the cause in this repository and fix it. Run the same check locally before you say it is fixed.`,
                                )
                              }
                            >
                              Ask Claude to fix
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
