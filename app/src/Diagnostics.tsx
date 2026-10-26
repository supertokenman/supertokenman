import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { LogEntry } from '../electron/errlog'

/** Diagnostics: the app's own errors, kept on this machine with credentials masked. */
export function DiagnosticsSheet(props: { onClose: () => void }) {
  const [d, setD] = useState<{ recent: LogEntry[]; dir: string; crashes: string } | null>(null)
  const [done, setDone] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const load = () => void window.stm.diag.get().then(setD)
  useEffect(load, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe md" role="dialog" aria-label="Diagnostics">
        <header className="sheet-head">
          <div className="sheet-title">Diagnostics</div>
          <span className="faint">errors stay on this machine, keys masked</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <div className="ob-row">
            <button onClick={() => void window.stm.diag.open()}>Open the logs folder</button>
            <button onClick={() => void window.stm.diag.report().then((r) => navigator.clipboard.writeText(r)).then(() => setDone('Report copied'))}>Copy a report</button>
            <button className="ghost small" onClick={() => void window.stm.diag.selftest().catch(() => setTimeout(load, 200))}>Log a test error</button>
            <span className="spacer-flex" />
            {done && <span className="faint">{done}</span>}
          </div>
          <span className="chart-name">Last errors</span>
          {d?.recent.length === 0 && <div className="faint">None since the app started.</div>}
          <ol className="dg-list">
            {d?.recent.map((e, i) => (
              <li key={i} className={`dg-${e.level}`}>
                <button className="dg-row" onClick={() => setOpen(open === i ? null : i)}>
                  <span className="pb-state failed">{e.level}</span>
                  <code>{e.where}</code>
                  <span className="dg-msg">{e.text.split('\n')[0]}</span>
                  <span className="faint">{new Date(e.at).toLocaleTimeString()}</span>
                </button>
                {open === i && <pre className="ex-src">{e.text}</pre>}
              </li>
            ))}
          </ol>
          <div className="faint">Logs: {d?.dir}. Crash dumps (if any): {d?.crashes}. A report holds the versions and the last errors, masked again; read it before you paste it anywhere.</div>
        </div>
      </div>
    </div>
  )
}
