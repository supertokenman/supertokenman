import { useEffect, useState } from 'react'
import type { BwState } from './bridge'
import { IconClose } from './icons'
import { clean } from './errors'

/** Phase 108: link a name the app uses to an item in your Bitwarden or Vaultwarden; nothing is copied. */
export function BitwardenSheet(props: { onClose: () => void }) {
  const [st, setSt] = useState<BwState | null>(null)
  const [pw, setPw] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<{ id: string; name: string; fields: string[] }[]>([])
  const [name, setName] = useState('ANTHROPIC_API_KEY')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const call = <T,>(p: Promise<T>, then: (v: T) => void) => (setBusy(true), setErr(''), void p.then(then, (e) => setErr(clean(e))).finally(() => setBusy(false)))
  useEffect(() => call(window.stm.bitwarden.status(), setSt), [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe bw" role="dialog" aria-label="Bitwarden">
        <header className="sheet-head">
          <div className="sheet-title">Bitwarden</div>
          <span className="faint">{st?.status === 'unlocked' ? `unlocked · ${st.user ?? ''} · ${st.server ?? 'bitwarden.com'}` : 'your Bitwarden or Vaultwarden, through the official bw CLI'}</span>
          <span className="spacer-flex" />
          {st?.status === 'unlocked' && <button className="ghost small" onClick={() => call(window.stm.bitwarden.lock(), setSt)}>Lock</button>}
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="pt-body">
          {!st ? null : !st.installed ? (
            <div className="faint">The bw CLI is not on the PATH. Install it from bitwarden.com/help/cli, run <code>bw login</code> once in a terminal (with <code>bw config server</code> first for Vaultwarden), then come back.</div>
          ) : st.status === 'unauthenticated' ? (
            <div className="faint">bw is installed but not logged in. Run <code>bw login</code> in a terminal; the app never asks for your login here.</div>
          ) : st.status !== 'unlocked' ? (
            <form className="pt-row" onSubmit={(e) => (e.preventDefault(), call(window.stm.bitwarden.unlock(pw), (s) => (setSt(s), setPw(''))))}>
              <label className="chart-name" htmlFor="bw-pw">Master password</label>
              <input id="bw-pw" type="password" value={pw} autoComplete="off" onChange={(e) => setPw(e.target.value)} />
              <button className="primary" disabled={!pw || busy}>Unlock</button>
              <span className="faint">Goes to bw for this unlock only; the session stays in the app's memory until you lock or quit.</span>
            </form>
          ) : (
            <>
              <form className="pt-row" onSubmit={(e) => (e.preventDefault(), call(window.stm.bitwarden.search(q), setItems))}>
                <label className="chart-name" htmlFor="bw-q">Find an item</label>
                <input id="bw-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Anthropic, R2, GitHub..." />
                <label className="chart-name" htmlFor="bw-name">Use as</label>
                <input id="bw-name" className="vb-short" value={name} spellCheck={false} onChange={(e) => setName(e.target.value.toUpperCase())} />
                <button disabled={!q || busy}>Search</button>
              </form>
              <div className="bw-items">
                {items.map((it) => (
                  <div key={it.id} className="pt-file"><b>{it.name}</b><span className="spacer-flex" />
                    {it.fields.map((f) => <button key={f} className="ghost small" disabled={busy} onClick={() => call(window.stm.bitwarden.link(name, it.id, f, `${it.name} · ${f.replace(/^field:/, '')}`), setSt)}>{f.replace(/^field:/, '')}</button>)}
                  </div>
                ))}
              </div>
            </>
          )}
          {err && <div className="bg-err">{err}</div>}
          {!!st?.links.length && (
            <>
              <div className="sp-label">Linked</div>
              {st.links.map((l) => (
                <div key={l.name} className="pt-file"><code>{l.name}</code><span className="faint">{l.label}</span><span className="spacer-flex" /><code className="faint">{l.shown ?? (st.status === 'unlocked' ? 'reading…' : 'locked')}</code><button className="ghost small" onClick={() => call(window.stm.bitwarden.unlink(l.name), setSt)}>Unlink</button></div>
              ))}
              <div className="faint">A linked name is read from Bitwarden when the app needs it and kept in memory for 15 minutes; it is never written to disk. While locked, the app's own vault answers instead.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
