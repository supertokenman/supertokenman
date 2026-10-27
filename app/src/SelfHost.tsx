import { useEffect, useState } from 'react'
import { CATALOG, composeOf, needsOf, type SelfApp } from '../shared/selfhost'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconClose, IconDeploy, IconExternal } from './icons'
import './bridge'
import { Checkbox, NumberField, Select } from './ui'

/**
 * Self-hosting: apps worth running on your own server, each a single container. Pick one, read the
 * compose file, and deploy it to a host from ~/.ssh/config: it is written to ~/selfhost/<app> there and
 * started with docker compose. Bound to localhost unless you open it; secrets come from the vault.
 */
export function SelfHostSheet(props: { onClose: () => void }) {
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<SelfApp>(CATALOG[0]!)
  const cats = [...new Set(CATALOG.map((a) => a.category))]
  const shown = CATALOG.filter((a) => (!cat || a.category === cat) && (!q || `${a.name} ${a.what}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ps sh" role="dialog" aria-label="Self-hosting">
        <header className="sheet-head">
          <div className="sheet-title">Self-hosting</div>
          <span className="faint">{CATALOG.length} single-container apps · deploy over ssh</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ps-bar">
          <input placeholder="Filter apps" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter apps" />
          <div className="segmented" role="group">{['', ...cats].map((c) => <button key={c || 'all'} className={cat === c ? 'on' : ''} aria-selected={cat === c} onClick={() => setCat(c)}>{c || 'All'}</button>)}</div>
        </div>
        <div className="ps-body">
          <div className="ps-list">
            {shown.map((a) => (
              <button key={a.id} className={`ps-hit ${a.id === pick.id ? 'on' : ''}`} onClick={() => setPick(a)}>
                <span className="ps-meta"><b>{a.name}</b><span>{a.category}</span><span className="ps-when">{a.license}</span></span>
                <span className="ps-reply faint">{a.what}</span>
              </button>
            ))}
          </div>
          <Deploy key={pick.id} app={pick} />
        </div>
      </div>
    </div>
  )
}

function Deploy(props: { app: SelfApp }) {
  const a = props.app
  const [hosts, setHosts] = useState<string[]>([])
  const [host, setHost] = useState('')
  const [port, setPort] = useState(a.port < 1024 ? 8000 + a.port : a.port)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; text: string; where: string } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.remote.hosts().then((h) => (setHosts(h), setHost(h[0] ?? ''))), [])
  const go = async () => {
    setBusy(true)
    setErr('')
    setRes(null)
    try {
      setRes(await window.stm.selfhost.deploy(host, a.id, port, open))
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
    setConfirm(false)
  }
  return (
    <div className="ps-preview">
      <div className="ps-preview-head">
        <span className="fld-label">{a.name}</span>
        <span className="spacer-flex" />
        <a className="is-link" href={a.url} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(a.url))}><IconExternal />Project</a>
      </div>
      <div>{a.what}</div>
      <div className="faint">License as the project states it: {a.license}. Check it, and the project's own docs, before relying on it.</div>
      <div className="fld-grid">
        <label className="fld"><span className="fld-label">Host, from ~/.ssh/config</span>{hosts.length ? <Select value={host} onChange={(e) => (setHost(e.target.value), setConfirm(false))}>{hosts.map((h) => <option key={h}>{h}</option>)}</Select> : <input value={host} placeholder="my-server" onChange={(e) => setHost(e.target.value.trim())} />}</label>
        <label className="fld"><span className="fld-label">Port on the host</span><NumberField min={1} max={65535} value={port} onChange={(e) => (setPort(Number(e.target.value)), setConfirm(false))} /></label>
        <label className="check wide"><Checkbox checked={open} onChange={(e) => (setOpen(e.target.checked), setConfirm(false))} /> Open it on all interfaces (otherwise only 127.0.0.1 on the host: reach it through a tunnel or a reverse proxy)</label>
      </div>
      {needsOf(a).length > 0 && <div className="faint">Needs {needsOf(a).join(', ')} in the vault; it is filled in only when the file is sent.</div>}
      <pre className="ob-pre">{composeOf(a, { hostPort: port, publicBind: open })}</pre>
      {confirm && <div className="notice">This writes ~/selfhost/{a.id}/compose.yml on {host} and runs docker compose up -d there{open ? `, open to the network on port ${port}` : ''}.</div>}
      <div className="ob-row">
        <span className="spacer-flex" />
        {confirm ? <><button className="ghost small" onClick={() => setConfirm(false)}>Cancel</button><button className="primary small" disabled={busy} onClick={() => void go()}>{busy ? <StateMark state="busy" label="Deploying" /> : <IconDeploy />}Deploy to {host}</button></> : <button className="primary small" disabled={!host || busy} onClick={() => setConfirm(true)}><IconDeploy />Deploy…</button>}
      </div>
      {err && <div className="notice error">{err}</div>}
      {res && <div className={res.ok ? 'notice' : 'notice error'}>{res.ok ? `Running: ${res.where}` : 'Docker compose failed:'}<pre className="ob-pre">{res.text}</pre></div>}
    </div>
  )
}
