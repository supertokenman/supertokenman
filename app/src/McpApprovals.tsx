import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { MODES, type Mode, type Policy, type ToolRule } from '../shared/mcppolicy'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
const RULES: Record<ToolRule | '', string> = { '': 'As the server', allow: 'Always runs', ask: 'Always asks', deny: 'Never runs' }

/**
 * MCP approvals: for the MCP servers you installed, a read runs without a card and a write waits for
 * Approve. Set it per server, per persona, or for one tool. Tool classes come from what the inspector
 * read from each server, or from the tool's name.
 */
export function McpApprovalsSheet(props: { cwd?: string; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof window.stm.mpol.get>> | null>(null)
  const [persona, setPersona] = useState('')
  const [server, setServer] = useState('')
  const [err, setErr] = useState('')
  const load = () => void window.stm.mpol.get(props.cwd ?? '').then((d) => (setData(d), setServer((s) => s || d.servers[0] || '')), (e) => setErr(clean(e)))
  useEffect(load, [])
  if (!data) return null
  const p = data.policy
  const save = (next: Policy) => void window.stm.mpol.set(next).then((policy) => setData({ ...data, policy }), (e) => setErr(clean(e)))
  const mode = (m: Mode | '', set: (m: Mode | '') => void, inherit?: string) => (
    <select value={m} onChange={(e) => set(e.target.value as Mode | '')}>
      {inherit != null && <option value="">{inherit}</option>}
      {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
  const learned = p.learned[server] ?? {}
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="MCP approvals">
        <header className="sheet-head">
          <div className="sheet-title">MCP approvals</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        <div className="cf-body">
          <div className="cf-col">
            <div className="faint">For the MCP servers you installed. A read runs without a card; a write waits for Approve. The app's own servers keep their usual rules. Changes apply to the next call.</div>
            <label className="fld"><span className="fld-label">Default for every server</span>{mode(p.default, (m) => save({ ...p, default: (m || 'reads') as Mode }))}</label>
            <div className="ob-label">By server</div>
            {!data.servers.length && <div className="faint">No MCP servers installed here. Add one from the MCP catalog.</div>}
            {data.servers.map((s) => (
              <div key={s} className="ap-row">
                <span className="in-name">{s}</span>
                {mode(p.servers[s] ?? '', (m) => save({ ...p, servers: m ? { ...p.servers, [s]: m } : Object.fromEntries(Object.entries(p.servers).filter(([k]) => k !== s)) }), 'Default')}
              </div>
            ))}
            <div className="ob-label">By persona</div>
            <label className="fld"><span className="fld-label">Persona</span>
              <select value={persona} onChange={(e) => setPersona(e.target.value)}><option value="">Pick one</option>{data.personas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </label>
            {persona && data.servers.map((s) => (
              <div key={s} className="ap-row">
                <span className="in-name">{s}</span>
                {mode(p.personas[persona]?.[s] ?? '', (m) => {
                  const cur = { ...(p.personas[persona] ?? {}) }
                  if (m) cur[s] = m
                  else delete cur[s]
                  save({ ...p, personas: { ...p.personas, [persona]: cur } })
                }, 'As the server')}
              </div>
            ))}
          </div>
          <div className="cf-col">
            <div className="ob-label">By tool</div>
            <label className="fld"><span className="fld-label">Server</span>
              <select value={server} onChange={(e) => setServer(e.target.value)}>{data.servers.map((s) => <option key={s}>{s}</option>)}</select>
            </label>
            {server && !Object.keys(learned).length && <div className="faint">The app has not read {server}'s tools yet. Open it once in the MCP inspector; its tools and their classes show here.</div>}
            {Object.entries(learned).map(([t, cls]) => (
              <div key={t} className="ap-row ap-tool">
                <span className="in-name">{t}</span>
                <span className={`in-cls ${cls}`}>{cls === 'read' ? 'Read' : 'Write'}</span>
                <select value={p.tools[`${server}/${t}`] ?? ''} onChange={(e) => {
                  const k = `${server}/${t}`
                  const tools = { ...p.tools }
                  if (e.target.value) tools[k] = e.target.value as ToolRule
                  else delete tools[k]
                  save({ ...p, tools })
                }}>{Object.entries(RULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </div>
            ))}
            {err && <div className="notice error">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
