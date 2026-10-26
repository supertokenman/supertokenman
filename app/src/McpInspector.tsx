import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { argsOf, fieldsOf, type Field } from '../shared/mcpinspect'
import type { InspConn } from './bridge'
import { clean } from './errors'
import './bridge'
import { McpAppFrame } from './McpAppFrame'
import { uiUriOf } from '../shared/mcpapps'

const close = (
  <IconClose />
)
type Tool = InspConn['tools'][number]
type Call = Awaited<ReturnType<typeof window.stm.insp.call>>

/**
 * The MCP inspector: connect to one server (installed, or a command or URL), see its tools, resources
 * and prompts with their schemas, and call a tool by hand. Write tools ask first. Tool descriptions
 * that try to give the model orders are flagged.
 */
export function McpInspectorSheet(props: { cwd?: string; onClose: () => void }) {
  const cwd = props.cwd ?? ''
  const [servers, setServers] = useState<Awaited<ReturnType<typeof window.stm.insp.servers>>>([])
  const [mode, setMode] = useState<'installed' | 'command' | 'url'>('installed')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('npx -y @modelcontextprotocol/server-everything')
  const [url, setUrl] = useState('https://')
  const [conn, setConn] = useState<InspConn | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'tools' | 'resources' | 'prompts'>('tools')
  const [pick, setPick] = useState<string | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    void window.stm.insp.servers(cwd).then((l) => (setServers(l), setName((n) => n || l[0]?.name || ''), !l.length && setMode('command')))
    return () => void window.stm.insp.close()
  }, [])
  const connect = () => {
    setBusy(true)
    setErr('')
    setConn(null)
    const [cmd, ...args] = command.trim().split(/\s+/)
    const t = mode === 'installed' ? { name } : mode === 'url' ? { url, type: /\/sse\b/.test(url) ? ('sse' as const) : ('http' as const) } : { command: cmd, args }
    void window.stm.insp.connect(t, cwd).then((c) => (setConn(c), setPick(c.tools[0]?.name ?? null), setTab(c.tools.length ? 'tools' : c.resources.length ? 'resources' : 'prompts')), (e) => setErr(clean(e))).finally(() => setBusy(false))
  }
  const tool = conn?.tools.find((t) => t.name === pick)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="MCP inspector">
        <header className="sheet-head">
          <div className="sheet-title">MCP inspector</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        <div className="in-bar">
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={mode === 'installed'} disabled={!servers.length} onClick={() => setMode('installed')}>Installed</button>
            <button role="tab" aria-selected={mode === 'command'} onClick={() => setMode('command')}>Command</button>
            <button role="tab" aria-selected={mode === 'url'} onClick={() => setMode('url')}>URL</button>
          </div>
          <div className="fld ob-grow">
            {mode === 'installed' ? (
              <select value={name} onChange={(e) => setName(e.target.value)} aria-label="Server">{servers.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.kind} · {s.target}</option>)}</select>
            ) : mode === 'command' ? (
              <input value={command} onChange={(e) => setCommand(e.target.value)} aria-label="Command" spellCheck={false} />
            ) : (
              <input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL" spellCheck={false} />
            )}
          </div>
          <button className="primary" disabled={busy} onClick={connect}>{busy ? 'Connecting…' : conn ? 'Reconnect' : 'Connect'}</button>
        </div>
        {err && <div className="in-note"><div className="notice error">{err}</div></div>}
        {!conn ? (
          <div className="dsg-body faint">{busy ? 'Starting the server…' : 'Connect to a server to see what it offers. A command runs on this machine, as Claude Code would run it.'}</div>
        ) : (
          <div className="cf-body in-body">
            <div className="cf-col ob-list">
              <div className="in-sum">
                <b>{conn.server ? `${conn.server.name} ${conn.server.version}` : conn.label}</b>
                <span className="faint">connected in {conn.ms} ms · tool list about {conn.tokens.toLocaleString()} tokens per turn</span>
              </div>
              <div className="segmented small" role="tablist">
                <button role="tab" aria-selected={tab === 'tools'} onClick={() => setTab('tools')}>Tools {conn.tools.length}</button>
                <button role="tab" aria-selected={tab === 'resources'} onClick={() => setTab('resources')}>Resources {conn.resources.length}</button>
                <button role="tab" aria-selected={tab === 'prompts'} onClick={() => setTab('prompts')}>Prompts {conn.prompts.length}</button>
              </div>
              {tab === 'tools' && conn.tools.map((t) => (
                <button key={t.name} className={`ob-turn ${t.name === pick ? 'on' : ''}`} onClick={() => setPick(t.name)}>
                  <span className="ob-turn-top"><span className="in-name">{t.name}</span><span className={`in-cls ${t.cls}`}>{t.cls === 'read' ? 'Read' : 'Write'}</span></span>
                  <span className="ob-turn-prompt faint">{t.flags.length ? `Flagged: ${t.flags[0]}` : t.description}</span>
                </button>
              ))}
              {tab === 'resources' && conn.resources.map((r) => <ResourceRow key={r.uri} r={r} />)}
              {tab === 'prompts' && conn.prompts.map((p) => <PromptRow key={p.name} p={p} />)}
              {conn.instructions && <details className="s2c-file"><summary>Server instructions</summary><pre className="ob-pre">{conn.instructions}</pre></details>}
            </div>
            <div className="cf-col">{tab === 'tools' && tool ? <ToolView key={tool.name} t={tool} all={conn.tools} /> : <div className="faint">{tab === 'tools' ? 'Pick a tool.' : 'Open a row on the left to read it.'}</div>}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function FieldInput(props: { f: Field; value: string; onChange: (v: string) => void }) {
  const { f } = props
  return (
    <label className={`fld ${f.kind === 'json' ? 'wide' : ''}`}>
      <span className="fld-label">{f.name}{f.required ? <i aria-label="required">*</i> : null}<span className="fld-kind">{f.kind}</span></span>
      {f.kind === 'enum' ? (
        <select value={props.value} onChange={(e) => props.onChange(e.target.value)}><option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
      ) : f.kind === 'boolean' ? (
        <select value={props.value} onChange={(e) => props.onChange(e.target.value)}><option value="">—</option><option value="true">true</option><option value="false">false</option></select>
      ) : f.kind === 'json' ? (
        <textarea rows={3} spellCheck={false} placeholder="JSON" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input type={f.kind === 'string' ? 'text' : 'number'} spellCheck={false} placeholder={f.default != null ? String(f.default) : ''} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      )}
      {f.description && <span className="fld-help">{f.description}</span>}
    </label>
  )
}

function ToolView(props: { t: Tool; all: Tool[] }) {
  const { t } = props
  const ui = uiUriOf(t as { _meta?: Record<string, unknown> })
  const [sent, setSent] = useState<Record<string, unknown>>({})
  const fields = fieldsOf(t.inputSchema)
  const [values, setValues] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  const [res, setRes] = useState<Call | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const run = (confirmed: boolean) => {
    const a = argsOf(fields, values)
    if (a.error) return setErr(a.error)
    if (t.cls === 'write' && !confirmed) return setConfirm(true)
    setConfirm(false)
    setBusy(true)
    setErr('')
    setSent(a.args)
    void window.stm.insp.call(t.name, a.args, confirmed).then(setRes, (e) => (setRes(null), setErr(clean(e)))).finally(() => setBusy(false))
  }
  return (
    <>
      <div className="ob-head">
        <div className="ob-row"><b className="in-name ob-grow">{t.name}</b>{ui && <span className="in-cls app" title={ui}>App</span>}<span className={`in-cls ${t.cls}`}>{t.cls === 'read' ? 'Read' : 'Write'}</span></div>
        {t.description && <div className="in-desc">{t.description}</div>}
      </div>
      {t.flags.length > 0 && <div className="notice error">This description tries to steer the model: {t.flags.join('; ')}. Do not install a server that does this.</div>}
      {fields.length ? <div className="fld-grid">{fields.map((f) => <FieldInput key={f.name} f={f} value={values[f.name] ?? ''} onChange={(v) => setValues({ ...values, [f.name]: v })} />)}</div> : <div className="faint">No arguments.</div>}
      {confirm ? (
        <div className="notice ob-row"><span className="ob-grow">{t.name} can change things on the other side. Run it?</span><button className="danger" onClick={() => run(true)}>Run</button><button onClick={() => setConfirm(false)}>Cancel</button></div>
      ) : (
        <div className="ob-row"><button className="primary" disabled={busy} onClick={() => run(false)}>{busy ? 'Calling…' : 'Call'}</button>{res && <span className="faint">{res.ms} ms · {res.bytes.toLocaleString()} bytes{res.isError ? ' · the tool reported an error' : ''}</span>}</div>
      )}
      {err && <div className="notice error">{err}</div>}
      {res && (
        <>
          {(res.result.content ?? []).filter((c) => c.type === 'text').map((c, i) => <pre key={i} className={`ob-pre ${res.isError ? 'in-err' : ''}`}>{c.text}</pre>)}
          {ui && !res.isError && <McpAppFrame uri={ui} tools={props.all} input={sent} result={res.result} />}
          <details className="s2c-file"><summary>Raw answer</summary><pre className="ob-pre">{JSON.stringify(res.result, null, 2)}</pre></details>
        </>
      )}
      <details className="s2c-file"><summary>Input schema</summary><pre className="ob-pre">{JSON.stringify(t.inputSchema ?? {}, null, 2)}</pre></details>
    </>
  )
}

function ResourceRow(props: { r: InspConn['resources'][number] }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <details className="s2c-file" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && text == null && void window.stm.insp.resource(props.r.uri).then((x) => setText(x.contents.map((c) => c.text ?? `(${c.mimeType ?? 'binary'})`).join('\n')), (e) => setText(clean(e)))}>
      <summary>{props.r.name ?? props.r.uri} <span className="faint">{props.r.mimeType ?? ''}</span></summary>
      <pre className="ob-pre">{text ?? 'Reading…'}</pre>
    </details>
  )
}

function PromptRow(props: { p: InspConn['prompts'][number] }) {
  const [text, setText] = useState<string | null>(null)
  const needs = (props.p.arguments ?? []).some((a) => a.required)
  return (
    <details className="s2c-file" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && text == null && !needs && void window.stm.insp.prompt(props.p.name, {}).then((x) => setText(x.messages.map((m) => `${m.role}: ${m.content.text ?? ''}`).join('\n\n')), (e) => setText(clean(e)))}>
      <summary>{props.p.name} <span className="faint">{props.p.description ?? ''}</span></summary>
      <pre className="ob-pre">{needs ? `Takes ${(props.p.arguments ?? []).map((a) => a.name).join(', ')}.` : text ?? 'Reading…'}</pre>
    </details>
  )
}
