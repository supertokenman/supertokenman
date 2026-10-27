import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { Checkbox } from './ui'

type Info = Awaited<ReturnType<typeof window.stm.diagCheck.get>>

/** Phase 119: the project's check after Claude's edits, on or off for the focused panel's folder, and its last runs. */
export function DiagCheck(props: { sid?: string; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState('')
  const load = () => props.sid && void window.stm.diagCheck.get(props.sid).then(setInfo, (e) => setErr(clean(e)))
  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [props.sid])
  const flip = (on: boolean) => props.sid && void window.stm.diagCheck.set(props.sid, on).then(load, (e) => setErr(clean(e)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config ck" role="dialog" aria-label="Check after edits">
        <header className="sheet-head">
          <div className="sheet-title">Check after edits</div>
          <span className="faint">the project's own check; only errors a turn added go back to Claude</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ck-body">
          {!props.sid ? <div className="faint">Open a panel in a project first.</div> : !info ? <div className="faint">Reading the project…</div> : (
            <>
              <div className="ck-row">
                <div className="ck-k">PROJECT</div><code>{info.cwd}</code>
                <div className="ck-k">CHECK</div>{info.check ? <code>{info.check}</code> : <span className="faint">None found: no typecheck or lint script, no tsconfig.json, no ruff or mypy in pyproject.toml.</span>}
                <div className="ck-k">LIMIT</div><span>90 s per run; a slower check leaves the turn unchecked</span>
              </div>
              <label className="ck-toggle">
                <Checkbox checked={info.on} disabled={!info.check} onChange={(e) => flip(e.target.checked)} />
                <span>Run it around turns that edit files in this folder</span>
              </label>
              <p className="faint ck-how">Before the turn's first edit the check runs once; when Claude is about to finish it runs again. New errors go back to Claude one time, with the files it touched first. Errors that were there before are left out.</p>
              <div className="sp-label">Last runs in this panel</div>
              {info.runs.length === 0 && <div className="faint">None yet.</div>}
              {info.runs.map((r) => (
                <div key={r.at} className={`ck-run ${r.fresh.length ? 'bad' : 'ok'}`}>
                  <div className="ck-run-head">
                    <span className="ck-mark">{r.fresh.length ? `${r.fresh.length} NEW` : 'CLEAN'}</span>
                    <span className="faint">{new Date(r.at).toLocaleTimeString()}</span>
                    <span className="faint">{r.before} before · {r.after} after · {(r.ms / 1000).toFixed(1)} s</span>
                  </div>
                  {r.fresh.slice(0, 8).map((d, i) => <div key={i} className="ck-diag"><code>{d.file}:{d.line}</code><span className="ck-code">{d.code}</span><span>{d.message}</span></div>)}
                </div>
              ))}
            </>
          )}
          {err && <div className="bg-err">{err}</div>}
        </div>
      </div>
    </div>
  )
}
