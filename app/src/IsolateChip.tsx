import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { clean } from './errors'
import { Checkbox } from './ui'

type St = { on: boolean; image: string; network: boolean }

/** Run this panel's commands in a container: the project only, no network until turned on, no secrets. */
export function IsolateChip(props: { sid: string; onNote: (t: string) => void }) {
  const [st, setSt] = useState<St | null>(null)
  const [open, setOpen] = useState(false)
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useEffect(() => void window.stm.iso.status(props.sid).then((s) => (setSt(s), setImage(s.image))), [props.sid])
  const act = (p: Promise<St | { on: boolean }>) => {
    setBusy(true)
    void p.then((s) => setSt((o) => ({ ...(o ?? { image, network: false }), ...s } as St)), (e) => props.onNote(clean(e))).finally(() => (setBusy(false), setOpen(false)))
  }
  if (!st) return null
  return (
    <span className="iso-wrap">
      <button className={`ghost small iso-chip ${st.on ? 'on' : ''} ${st.on && st.network ? 'net' : ''}`} data-tip={st.on ? `Commands run in ${st.image}` : 'Run this panel\'s commands in a container'} onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setAt({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 336) })
        setOpen(!open)
      }}>
        {busy ? 'Starting...' : st.on ? (st.network ? 'Isolated · network on' : 'Isolated · no network') : 'Isolate'}
      </button>
      {open && createPortal(
        <div className="iso-pop" role="dialog" aria-label="Isolate commands" style={{ top: at.top, left: at.left }}>
          {!st.on ? (
            <>
              <div className="faint">Claude's commands run in a Docker container with this folder only, no network and none of the app's keys. Files it changes are changed here too.</div>
              <label className="chart-name" htmlFor="iso-img">Image</label>
              <input id="iso-img" value={image} onChange={(e) => setImage(e.target.value)} spellCheck={false} />
              <div className="ob-row"><span className="spacer-flex" /><button onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => act(window.stm.iso.start(props.sid, image))}>Start</button></div>
            </>
          ) : (
            <>
              <label className="ca-toggle"><Checkbox checked={st.network} onChange={(e) => act(window.stm.iso.network(props.sid, e.target.checked))} />Let the container reach the network</label>
              <div className="ob-row"><span className="spacer-flex" /><button className="danger" onClick={() => act(window.stm.iso.stop(props.sid))}>Stop isolating</button></div>
            </>
          )}
        </div>,
        document.body,
      )}
    </span>
  )
}
