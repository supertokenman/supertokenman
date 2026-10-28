import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { failureReport, feed, type Job, type Run } from '../shared/act'
import { Checkbox } from './ui'

/** Phase 110: a GitHub Actions job run on this machine with act, before the push. */
export function RunCi(props: { cwd?: string; sid?: string; onClose: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [secrets, setSecrets] = useState<string[]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [run, setRun] = useState<Run | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => void (props.cwd && window.stm.act.jobs(props.cwd).then((r) => (setJobs(r.jobs), setSecrets(r.secrets), setJob(r.jobs[0] ?? null)))), [props.cwd])
  useEffect(() => window.stm.act.onLine((l) => (setLog((x) => [...x, l].slice(-400)), setRun((r) => (r ? feed(r, l) : r)))), [])
  const start = () => {
    if (!job || !props.cwd) return
    setRun({ job: job.id, steps: [], done: null })
    setLog([])
    setBusy(true)
    setMsg('')
    void window.stm.act.run(props.cwd, job, [...ticked]).then((code) => setMsg(code === 0 ? 'The job passed here.' : code === 127 ? '' : `act ended with code ${code}.`), (e) => setMsg(clean(e))).finally(() => setBusy(false))
  }
  const report = run && job ? failureReport(run, job) : ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ci" role="dialog" aria-label="Run CI here">
        <header className="sheet-head">
          <div className="sheet-title">Run CI here</div>
          <span className="faint">a job of .github/workflows run with act in local Docker, before you push</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="tr-body">
          <aside className="tr-groups">
            <div className="chart-name">Jobs</div>
            {!jobs.length && <div className="faint">No workflows in {props.cwd ?? 'this panel'}.</div>}
            {jobs.map((j) => <button key={`${j.file}#${j.id}`} className={`ib-filter ${job === j ? 'on' : ''}`} onClick={() => setJob(j)}><b>{j.name}</b><span className="faint">{j.workflow} · {j.file.split('/').pop()}</span></button>)}
            <div className="chart-name">Secrets for this run</div>
            <div className="faint">None go unless ticked. Ticked ones are read from the vault now, written to a file only act reads, and the file is removed when it ends.</div>
            {secrets.map((n) => <label key={n} className="ca-toggle"><Checkbox checked={ticked.has(n)} onChange={(e) => setTicked((t) => { const x = new Set(t); if (e.target.checked) x.add(n); else x.delete(n); return x })} /><code>{n}</code></label>)}
          </aside>
          <main className="tr-main">
            <div className="ob-row">
              <b>{job?.name ?? 'Pick a job'}</b><span className="spacer-flex" />
              {busy ? <button onClick={() => void window.stm.act.stop()}>Stop</button> : <button className="primary" disabled={!job} onClick={start}>Run it here</button>}
            </div>
            {run && (
              <div className="ci-steps">
                {run.steps.map((s, i) => <div key={i} className={`ci-step ${s.status}`}><span className="ci-mark">{s.status === 'success' ? 'OK' : s.status === 'failure' ? 'FAIL' : '...'}</span><span>{s.name}</span></div>)}
                {run.done && <div className={`ci-done ${run.done}`}>{run.done === 'success' ? 'Job succeeded' : 'Job failed'}</div>}
              </div>
            )}
            {report && props.sid && <div className="ob-row"><span className="faint">The failing step and its last lines go to the panel; nothing else.</span><span className="spacer-flex" /><button className="primary" onClick={() => void window.stm.send(props.sid!, report).then(() => setMsg('Sent to the panel.'))}>Send the failure to Claude</button></div>}
            {msg && <div className="faint">{msg}</div>}
            {!!log.length && <pre className="ci-log">{log.join('\n')}</pre>}
          </main>
        </div>
      </div>
    </div>
  )
}
