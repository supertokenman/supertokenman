import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { Checkbox } from './ui'

type Info = { on: boolean; url: string | null; phones: { name: string; at: number }[]; send: boolean; port: number }

/** Phone companion: see panels, answer asks and (if allowed) send, from a phone on the same network. */
export function PhoneCompanionSheet(props: { onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [code, setCode] = useState<{ code: string; until: number; paired: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState('')
  const load = () => void window.stm.phone.get().then(setInfo)
  useEffect(() => {
    load()
    const t = setInterval(() => (setNow(Date.now()), load()), 1000)
    return () => clearInterval(t)
  }, [])
  const act = (p: Promise<unknown>) => void p.then(load, (e) => setErr(clean(e)))
  // a code is spent once a phone pairs with it
  useEffect(() => { if (code && info && info.phones.length > code.paired) setCode(null) }, [info, code])
  const left = code ? Math.max(0, Math.ceil((code.until - now) / 1000)) : 0
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe md" role="dialog" aria-label="Phone companion">
        <header className="sheet-head">
          <div className="sheet-title">Phone companion</div>
          <span className="faint">{info?.on ? 'On, local network' : 'Off'}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <div className="ob-row">
            {info?.on ? <button onClick={() => (setCode(null), act(window.stm.phone.stop()))}>Turn off</button> : <button className="primary" onClick={() => act(window.stm.phone.start())}>Turn on</button>}
            {info?.on && <code className="pc-url">{info.url}</code>}
          </div>
          {info?.on && (
            <>
              <span className="chart-name">Pair a phone</span>
              <div className="faint">Open the address above on the phone, then type this code.</div>
              {code && left > 0 ? (
                <div className="pc-code" aria-label="Pairing code"><b>{code.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</b><span className="faint">{left} s</span></div>
              ) : (
                <div><button onClick={() => void window.stm.phone.code().then((c) => setCode({ ...c, paired: info.phones.length }), (e) => setErr(clean(e)))}>Show a pairing code</button></div>
              )}
              <span className="chart-name">Paired</span>
              {info.phones.length ? (
                <ul className="ca-tools">{info.phones.map((p, i) => <li key={i}>{p.name} <span className="faint">since {new Date(p.at).toLocaleTimeString()}</span></li>)}</ul>
              ) : <div className="faint">No phone yet.</div>}
              {info.phones.length > 0 && <div><button className="danger" onClick={() => act(window.stm.phone.forget())}>Unpair all</button></div>}
            </>
          )}
          <label className="ca-toggle"><Checkbox checked={Boolean(info?.send)} disabled={!info} onChange={(e) => act(window.stm.phone.setSend(e.target.checked))} />Let the phone send messages to panels</label>
          {err && <div className="notice error">{err}</div>}
          <div className="faint">Off until you turn it on, and off again when the app quits. The phone sees folder names, pending asks and the end of the last reply; never files, keys or settings. Pairings live only in memory. The page is plain http on your network: use it on networks you trust.</div>
        </div>
      </div>
    </div>
  )
}
