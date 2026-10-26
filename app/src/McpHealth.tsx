import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { HealthRow } from './bridge'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/**
 * MCP health: each installed server started and its tools read, how long it took and how much context its
 * tool list takes on every turn, and the tools that are new or changed since you approved the server.
 * Those are held in panels until you look.
 */
export function McpHealthSheet(props: { cwd?: string; onClose: () => void; onInspect: () => void; onApprovals: () => void }) {
  const cwd = props.cwd ?? ''
  const [rows, setRows] = useState<HealthRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.mhealth.get(cwd).then(setRows, (e) => setErr(clean(e))), [])
  const check = (name?: string) => (setBusy(name ?? '*'), setErr(''), void window.stm.mhealth.check(cwd, name).then(setRows, (e) => setErr(clean(e))).finally(() => setBusy(null)))
  const max = Math.max(1, ...(rows ?? []).map((r) => r.last?.tokens ?? 0))
  const total = (rows ?? []).reduce((n, r) => n + (r.last?.ok ? r.last.tokens : 0), 0)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="MCP health">
        <header className="sheet-head">
          <div className="sheet-title">MCP health</div>
          <span className="faint">{rows?.length ? `${rows.length} servers · tool lists about ${total.toLocaleString()} tokens per turn` : ''}</span>
          <span className="spacer-flex" />
          <button className="primary small" disabled={!!busy || !rows?.length} onClick={() => check()}>{busy === '*' ? 'Checking…' : 'Check all'}</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        <div className="dsg-body mh-body">
          <div className="faint">A check starts each server, reads its tools and closes it; no tool is called. The first good check is taken as approved. After that, a tool that is new or whose description changed is held in panels until you look at it: a description reaches the model on every turn.</div>
          {err && <div className="notice error">{err}</div>}
          {rows && !rows.length && <div className="faint">No MCP servers installed for this folder. Add one from the MCP catalog.</div>}
          {rows?.map((r) => (
            <section key={r.name} className={`mh-row ${r.held.length ? 'held' : ''}`}>
              <div className="mh-top">
                <span className={`mn-dot ${!r.last ? '' : r.last.ok ? 'up' : 'down'}`} />
                <span className="mh-name"><b className="in-name">{r.name}</b><span className="faint">{r.kind} · {r.target}</span></span>
                <span className="mh-stat">{r.last ? (r.last.ok ? `${r.last.count} ${r.last.count === 1 ? "tool" : "tools"} · ${r.last.ms} ms${r.last.version ? ` · v${r.last.version}` : ''}` : r.last.error) : 'Not checked yet'}</span>
                <span className="faint mh-when">{r.last ? ago(r.last.at) : ''}</span>
                <button className="ghost small" disabled={!!busy} onClick={() => check(r.name)}>{busy === r.name ? 'Checking…' : 'Check'}</button>
              </div>
              {r.last?.ok && (
                <div className="mh-cost" title={`${r.last.tokens.toLocaleString()} tokens`}>
                  <span className="ob-label">Context per turn</span>
                  <span className="mh-bar"><i style={{ width: `${(r.last.tokens / max) * 100}%` }} /></span>
                  <span className="mh-tok">{r.last.tokens.toLocaleString()}</span>
                </div>
              )}
              {r.held.length > 0 && r.change && (
                <div className="mh-held">
                  <div><b>Held in panels:</b> {[...r.change.added.map((t) => `${t} (new)`), ...r.change.changed.map((t) => `${t} (changed)`)].join(', ')}{r.change.removed.length ? `. Gone: ${r.change.removed.join(', ')}` : ''}</div>
                  <div className="ob-row">
                    <span className="faint ob-grow">Read the new descriptions in the inspector before approving.</span>
                    <button onClick={props.onInspect}>Open inspector</button>
                    <button className="primary" onClick={() => void window.stm.mhealth.approve(cwd, r.name).then(setRows, (e) => setErr(clean(e)))}>Approve these tools</button>
                  </div>
                </div>
              )}
              {!r.held.length && r.change?.removed.length ? <div className="faint">Gone since approved: {r.change.removed.join(', ')}</div> : null}
            </section>
          ))}
          {!!rows?.length && <div className="ob-row"><span className="faint ob-grow">A heavy tool list costs on every turn. Turn a server off for the personas that do not need it.</span><button onClick={props.onApprovals}>MCP approvals</button></div>}
        </div>
      </div>
    </div>
  )
}
