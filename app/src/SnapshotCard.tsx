import { useEffect, useState } from 'react'

/** Phase 96: the snapshot the app made before a compact, shown before it goes back to Claude. */
export function SnapshotCard(props: { sid: string; text: string; inject: boolean; onDone: () => void }) {
  const [text, setText] = useState(props.text)
  const [inject, setInject] = useState(props.inject)
  useEffect(() => (setText(props.text), setInject(props.inject)), [props.text, props.inject])
  const save = (t: string, i: boolean) => void window.stm.snap.set(props.sid, t, i)
  return (
    <div className="snap-card" role="region" aria-label="Snapshot for after the compact">
      <div className="snap-head">
        <span className="chart-name">Snapshot</span>
        <span className="faint">The context is being compacted. This goes back to Claude after it, so it knows where it was.</span>
        <span className="spacer-flex" />
        <button className="ghost small" onClick={props.onDone}>Hide</button>
      </div>
      <textarea value={text} rows={Math.min(10, text.split('\n').length + 1)} spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={() => save(text, inject)} />
      <label className="ca-toggle"><input type="checkbox" checked={!inject} onChange={(e) => (setInject(!e.target.checked), save(text, !e.target.checked))} />Do not hand this back</label>
    </div>
  )
}
