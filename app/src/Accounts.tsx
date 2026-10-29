import { useEffect, useState } from 'react'
import type { PostNet } from './bridge'
import { ACCOUNT_FIELDS, ACCOUNT_NAME, ACCOUNTS } from '../shared/accounts'
import type { Net } from '../shared/social'
import { clean } from './errors'

/**
 * The social accounts, one connection per network, shared by Post everywhere, Mentions and Business.
 * Keys go to the vault and this window never sees them again.
 */
export function Accounts(props: { only?: Net[]; note?: string; onChange?: (l: PostNet[]) => void }) {
  const [nets, setNets] = useState<PostNet[]>([])
  const [setup, setSetup] = useState<Net | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const got = (l: PostNet[]) => (setNets(l), props.onChange?.(l), setMsg(''))
  useEffect(() => void window.stm.accounts.status().then(got, (e) => setMsg(clean(e))), [])
  const connect = () => {
    if (!setup) return
    setBusy(true)
    window.stm.accounts.connect(setup, fields).then((l) => (got(l), setSetup(null), setFields({})), (e) => setMsg(clean(e))).finally(() => setBusy(false))
  }
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <div className="chart-name">Accounts</div>
      <div className="faint">One connection per network, used by Post everywhere and Mentions. Keys stay in the vault; this window never sees them again.{props.note ? ` ${props.note}` : ''}</div>
      {(props.only ?? ACCOUNTS).map((id) => {
        const n = nets.find((x) => x.net === id)
        return (
          <div key={id} className="ob-row">
            <span style={{ minWidth: 90 }}>{ACCOUNT_NAME[id]}</span>
            <span className="faint">{n?.connected ? `connected · ${n.host}` : 'not connected'}</span>
            <span className="spacer-flex" />
            {n?.connected
              ? <button onClick={() => void window.stm.accounts.disconnect(id).then(got, (e) => setMsg(clean(e)))}>Disconnect</button>
              : <button onClick={() => (setSetup(setup === id ? null : id), setFields({}))}>{setup === id ? 'Cancel' : 'Connect'}</button>}
          </div>
        )
      })}
      {setup && (
        <section style={{ display: 'grid', gap: 6 }}>
          {ACCOUNT_FIELDS[setup].map((f) => (
            <input key={f.key} aria-label={f.label} type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={`${f.label}${f.optional ? ' (optional)' : ''}${f.hint ? `: ${f.hint}` : ''}`} value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
          ))}
          <div className="ob-row">
            <button className="primary" disabled={busy} onClick={connect}>Save {ACCOUNT_NAME[setup]}</button>
            <span className="faint">{setup === 'bluesky' ? 'Bluesky signs in now and keeps only the session, not the app password.' : 'Saving sends nothing; the first request goes out when you use it.'}</span>
          </div>
        </section>
      )}
      {msg && <div className="error">{msg}</div>}
    </section>
  )
}
