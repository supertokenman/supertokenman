import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import type { Playbook, PbRun } from '../shared/playbook'

type Item = { file: string; playbook?: Playbook; error?: string }

/** Playbooks: procedures in .claude/playbooks, run step by step in a panel, with checks and checkpoints. */
export function PlaybooksSheet(props: { sid?: string; cwd?: string; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [runs, setRuns] = useState<PbRun[]>([])
  const [err, setErr] = useState('')
  const load = () => {
    if (props.cwd) void window.stm.pb.list(props.cwd).then(setItems)
    void window.stm.pb.runs(props.sid).then(setRuns)
  }
  useEffect(() => (load(), window.stm.pb.onChanged(load)), [props.cwd, props.sid])
  const run = (file: string, resume?: string) => {
    if (!props.sid) return setErr('Focus a panel first.')
    setErr('')
    void window.stm.pb.run(props.sid, file, resume).then(load, (e) => setErr(clean(e)))
    setTimeout(load, 300)
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Playbooks">
        <header className="sheet-head">
          <div className="sheet-title">Playbooks</div>
          <span className="faint">{props.cwd ? `${props.cwd.split('/').pop()}/.claude/playbooks` : 'focus a panel'}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ex-grid">
          <div className="ex-col">
            {items.length === 0 && <div className="faint">No playbooks in this project yet. A playbook is a YAML file: a name, and steps with a prompt or a skill, an optional check command and an optional checkpoint.</div>}
            {items.map((it) => (
              <section key={it.file} className="pb-card">
                <div className="ob-row"><b className="ob-grow">{it.playbook?.name ?? it.file}</b>{it.playbook && <button className="primary" disabled={!props.sid || runs.some((r) => r.file === it.file && ['running', 'checking', 'waiting'].includes(r.state))} onClick={() => run(it.file)}>Run here</button>}</div>
                {it.error ? <div className="notice error">{it.file}: {it.error}</div> : <div className="faint">{it.playbook!.description}</div>}
                {it.playbook && (
                  <ol className="pb-steps">
                    {it.playbook.steps.map((s, i) => (
                      <li key={i}><span>{s.name}</span>{s.skill && <span className="pb-tag">skill {s.skill}</span>}{s.check && <code className="pb-tag">{s.check}</code>}{s.checkpoint && <span className="pb-tag stop">checkpoint</span>}</li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
            {props.cwd && <div><button onClick={() => void window.stm.pb.create(props.cwd!).then(load)}>Add an example playbook</button></div>}
            {err && <div className="notice error">{err}</div>}
          </div>
          <div className="ex-col">
            <span className="chart-name">Runs in this panel</span>
            {runs.length === 0 && <div className="faint">None yet.</div>}
            {runs.map((r) => {
              const last = r.log.at(-1)
              return (
                <section key={r.id} className={`pb-run ${r.state}`}>
                  <div className="ob-row">
                    <b className="ob-grow">{r.name}</b>
                    <span className={`pb-state ${r.state}`}>{r.state}</span>
                    <span className="faint">step {Math.min(r.step + 1, r.of)} of {r.of}</span>
                  </div>
                  <div className="pb-bar"><i style={{ width: `${(Math.min(r.step, r.of) / r.of) * 100}%` }} /></div>
                  {last?.check && <details><summary className="faint">{last.ok ? 'Passed' : 'Failed'}: {last.check}</summary><pre className="ex-src">{last.out}</pre></details>}
                  <div className="ob-row">
                    {['failed', 'stopped'].includes(r.state) && <button onClick={() => run(r.file, r.id)}>{r.state === 'failed' ? 'Resume: ask for a fix' : 'Resume'}</button>}
                    {['running', 'checking', 'waiting'].includes(r.state) && <button onClick={() => void window.stm.pb.stop(r.id).then(load)}>Stop</button>}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
