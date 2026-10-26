import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'

type Info = Awaited<ReturnType<typeof window.stm.shortTerm.get>>

/** Phase 122: long tool results as one symbolic line for Claude, the original on disk; on per panel. */
export function ShortTerm(props: { sid?: string; onClose: () => void; onAttach: (note: { label: string; text: string }) => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [shown, setShown] = useState<{ id: string; text: string } | null>(null)
  const [err, setErr] = useState('')
  const load = () => props.sid && void window.stm.shortTerm.get(props.sid).then(setInfo, (e) => setErr(clean(e)))
  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [props.sid])
  const flip = (on: boolean) => props.sid && void window.stm.shortTerm.set(props.sid, on).then(load)
  const original = (id: string) => (props.sid ? window.stm.shortTerm.original(props.sid, id) : null)
  const saved = (info?.items ?? []).reduce((n, x) => n + x.savedTokens, 0)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config stc" role="dialog" aria-label="Short-term compression">
        <header className="sheet-head">
          <div className="sheet-title">Short-term compression</div>
          <span className="faint">long tool results reach Claude as one line; the original stays on disk</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="stc-body">
          {!props.sid ? <div className="faint">Open a panel first.</div> : !info ? <div className="faint">Reading…</div> : (
            <>
              <label className="stc-toggle">
                <input type="checkbox" checked={info.on} onChange={(e) => flip(e.target.checked)} />
                <span>On for this panel: results over 6 KB from commands, searches, web pages and connectors</span>
              </label>
              <p className="faint stc-how">Each kind has its rule: a log keeps its error lines and how it ended, a diff its files and counts, JSON its shape, a listing its folders. File reads and edits are never touched. Claude can read the original back itself; so can you, below.</p>
              <div className="stc-stats">
                <div><span className="stc-big">{info.items.length}</span><span className="faint">compressed</span></div>
                <div><span className="stc-big">~{saved.toLocaleString()}</span><span className="faint">tokens kept out</span></div>
              </div>
              {info.items.length === 0 && <div className="faint">Nothing compressed in this panel yet.</div>}
              {info.items.map((x) => (
                <div key={x.id} className="stc-row">
                  <div className="stc-line">
                    <span className="stc-kind">{x.kind}</span>
                    <code className="stc-what">{x.what}</code>
                    <span className="faint">{(x.chars / 1024).toFixed(1)} KB · ~{x.savedTokens.toLocaleString()} tokens</span>
                    <span className="spacer-flex" />
                    <button className="ghost small" onClick={() => void original(x.id)?.then((o) => setShown(shown?.id === x.id ? null : { id: x.id, text: o.text }), (e) => setErr(clean(e)))}>{shown?.id === x.id ? 'Hide' : 'Show original'}</button>
                    <button className="small" onClick={() => void original(x.id)?.then((o) => props.onAttach({ label: `${x.tool} output`, text: `The full output of ${x.what} (it reached you as a summary before):\n\`\`\`\n${o.text.slice(0, 120_000)}\n\`\`\`` }), (e) => setErr(clean(e)))}>Give it back to Claude</button>
                  </div>
                  <div className="faint stc-file">{x.file}</div>
                  {shown?.id === x.id && <pre className="stc-orig">{shown.text.slice(0, 60_000)}</pre>}
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
