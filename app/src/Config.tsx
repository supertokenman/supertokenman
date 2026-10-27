import { Fragment, useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { Provider } from '../shared/claudeconf'
import type { LogTurn } from '../shared/sessionlog'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'
import { Checkbox } from './ui'

const close = (
  <IconClose />
)
const name = (f: string) => f.split('/').pop() ?? f

/**
 * Providers and config: switch where Claude Code sends its requests without touching the rest of your
 * settings.json, choose per persona which MCP servers and skills it gets, and read past sessions turn
 * by turn: what changed and what failed.
 */
export function ConfigSheet(props: { cwd?: string; onClose: () => void }) {
  const [tab, setTab] = useState<'providers' | 'registry' | 'sessions'>('providers')
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config" role="dialog" aria-label="Providers and config">
        <header className="sheet-head">
          <div className="sheet-title">Providers and config</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'providers'} onClick={() => setTab('providers')}>Providers</button>
            <button role="tab" aria-selected={tab === 'registry'} onClick={() => setTab('registry')}>MCP and skills</button>
            <button role="tab" aria-selected={tab === 'sessions'} onClick={() => setTab('sessions')}>Sessions</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {tab === 'providers' ? <Providers /> : tab === 'registry' ? <Registry cwd={props.cwd ?? ''} /> : <Sessions cwd={props.cwd ?? ''} />}
      </div>
    </div>
  )
}

function Providers() {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.providers.state>> | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [pv, setPv] = useState<Awaited<ReturnType<typeof window.stm.providers.preview>> | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const blank: Provider = { id: '', name: '', baseUrl: '', keyName: '', model: '', smallModel: '' }
  const [form, setForm] = useState<Provider | null>(null)
  const load = () => void window.stm.providers.state().then(setSt, (e) => setErr(clean(e)))
  useEffect(load, [])
  const preview = (id: string) => (setPick(id), setMsg(''), void window.stm.providers.preview(id).then(setPv, (e) => (setPv(null), setErr(clean(e)))))
  const act = (p: Promise<unknown>, done: string) => void p.then(() => (setMsg(done), setErr(''), setPv(null), setPick(null), load()), (e) => setErr(clean(e)))
  if (!st) return <div className="dsg-body faint">{err || 'Reading settings.json…'}</div>
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="faint">Writes only the endpoint, the model and how the key is fetched in <code>{st.file}</code>. Hooks, MCP servers, permissions and your comments stay as they are. A backup is kept before every change.</div>
        {err && <div className="notice error">{err}</div>}
        {msg && <div className="notice">{msg}</div>}
        <div className="cf-list">
          {st.list.map((p) => (
            <div key={p.id} className={`cf-prov ${pick === p.id ? 'on' : ''}`}>
              <StateMark state={st.active === p.id ? 'up' : 'off'} label={st.active === p.id ? 'In use' : 'Not in use'} />
              <div className="cf-prov-main">
                <b>{p.name}</b>
                <span className="faint">{p.baseUrl || 'api.anthropic.com'}{p.model ? ` · ${p.model}` : ''}{p.keyName ? ` · key ${p.keyName}` : ''}</span>
                {p.note && <span className="faint">{p.note}</span>}
              </div>
              {st.active === p.id ? <span className="cf-inuse">In use</span> : <button className="ghost small" onClick={() => preview(p.id)}>Preview</button>}
              {!['claude', 'headroom'].includes(p.id) && <button className="ghost small" onClick={() => setForm(p)}>Edit</button>}
            </div>
          ))}
          {st.active === null && st.exists && <div className="faint">The endpoint in settings.json was set by hand; none of these match it.</div>}
        </div>
        {form ? (
          <div className="cf-form">
            <input id="cf-name" value={form.name} placeholder="Name, e.g. OpenRouter" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input id="cf-url" value={form.baseUrl} placeholder="Endpoint, e.g. https://openrouter.ai/api" onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            <input id="cf-key" value={form.keyName} placeholder="Vault entry with the key, e.g. OPENROUTER_KEY" onChange={(e) => setForm({ ...form, keyName: e.target.value.toUpperCase() })} />
            <input id="cf-model" value={form.model} placeholder="Model (optional)" onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <input id="cf-small" value={form.smallModel} placeholder="Small model (optional)" onChange={(e) => setForm({ ...form, smallModel: e.target.value })} />
            <div className="sbx-actions">
              {form.id && <button className="ghost small" onClick={() => (act(window.stm.providers.remove(form.id), `Removed ${form.name}.`), setForm(null))}>Remove</button>}
              <button className="ghost small" onClick={() => setForm(null)}>Cancel</button>
              <button className="primary small" onClick={() => void window.stm.providers.save(form).then(() => (setForm(null), setErr(''), load()), (e) => setErr(clean(e)))}>Save</button>
            </div>
            <div className="faint">Only endpoints you trust: whoever runs it sees your prompts and code. Cheap "relay" resellers are best avoided for that reason.</div>
          </div>
        ) : (
          <button className="ghost small cf-add" onClick={() => setForm(blank)}>+ Add a provider</button>
        )}
        {st.backups.length > 0 && (
          <details className="cf-backups">
            <summary className="sp-label">Backups · {st.backups.length}</summary>
            {st.backups.map((b) => (
              <div key={b} className="wr-rule"><code>{b.replace(/\.json$/, '')}</code><span className="spacer-flex" /><button className="ghost small" onClick={() => act(window.stm.providers.restore(b), 'Restored; the file before it was backed up too.')}>Restore</button></div>
            ))}
          </details>
        )}
      </div>
      <div className="cf-col cf-preview">
        {pv && pick ? (
          <>
            <div className="sp-label">What changes in settings.json</div>
            {pv.keyMissing && <div className="notice error">The vault has no entry named {st.list.find((p) => p.id === pick)?.keyName}. Add it first.</div>}
            {pv.after.includes('apiKeyHelper') && !st.helperInstalled && <div className="notice">Claude Code fetches the key through the stm command. Install it from the palette first (Install the stm command).</div>}
            <pre className="cf-diff">
              {pv.lines.map((l, i) => <div key={i} className={l.sign === '+' ? 'add' : l.sign === '-' ? 'del' : ''}><span>{l.sign}</span>{l.text}</div>)}
            </pre>
            <div className="sbx-actions">
              <span className="faint">New Claude Code sessions use it; open panels keep theirs until they restart.</span>
              <button className="ghost small" onClick={() => (setPv(null), setPick(null))}>Cancel</button>
              <button className="primary small" disabled={pv.keyMissing} onClick={() => act(window.stm.providers.apply(pick), `Switched to ${st.list.find((p) => p.id === pick)?.name}.`)}>Apply</button>
            </div>
          </>
        ) : (
          <div className="faint cf-empty">Pick Preview on a provider to see the exact lines that change before anything is written.</div>
        )}
      </div>
    </div>
  )
}

function Registry(props: { cwd: string }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.registry.state>> | null>(null)
  const [err, setErr] = useState('')
  const load = () => void window.stm.registry.state(props.cwd).then(setSt, (e) => setErr(clean(e)))
  useEffect(load, [props.cwd])
  if (!st) return <div className="dsg-body faint">{err || 'Reading what is installed…'}</div>
  const row = (kind: 'mcp' | 'skill', n: string, label: string, sub: string) => (
    <tr key={`${kind}:${n}`}>
      <td><b>{label}</b><div className="faint cf-sub">{sub}</div></td>
      {st.personas.map((p) => {
        const on = !(kind === 'mcp' ? p.mcpOff : p.skillsOff).includes(n)
        return (
          <td key={p.id} className="cf-cell">
            <Checkbox aria-label={`${label} for ${p.name}`} checked={on} onChange={(e) => void window.stm.registry.toggle(p.id, kind, n, e.target.checked).then(load, (x) => setErr(clean(x)))} />
          </td>
        )
      })}
    </tr>
  )
  return (
    <div className="dsg-body">
      <div className="faint">Installed once in Claude Code; untick what a persona should not have. The change is saved as a persona version, so it shows in Lab, Versions.</div>
      {err && <div className="notice error">{err}</div>}
      <div className="cf-matrix">
        <table>
          <thead><tr><th /> {st.personas.map((p) => <th key={p.id}><span className="cf-dot" style={{ background: p.color }} />{p.name}</th>)}</tr></thead>
          <tbody>
            <tr className="cf-group"><td colSpan={st.personas.length + 1}>MCP servers · {st.mcp.length}</td></tr>
            {st.mcp.length === 0 && <tr><td colSpan={st.personas.length + 1} className="faint">None installed in Claude Code (~/.claude.json or .mcp.json).</td></tr>}
            {st.mcp.map((m) => row('mcp', m.name, m.name, `${m.where} · ${m.kind} · ${m.target}`))}
            <tr className="cf-group"><td colSpan={st.personas.length + 1}>Skills · {st.skills.length}</td></tr>
            {st.skills.length === 0 && <tr><td colSpan={st.personas.length + 1} className="faint">No skills in ~/.claude/skills or the project's .claude/skills.</td></tr>}
            {st.skills.map((s) => row('skill', s.name, s.title, `${s.where ?? ''} · ${s.description.slice(0, 90)}`))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Sessions(props: { cwd: string }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof window.stm.sessionLogs.list>> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [turns, setTurns] = useState<LogTurn[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.sessionLogs.list(props.cwd).then(setList, (e) => setErr(clean(e))), [props.cwd])
  useEffect(() => void (open ? window.stm.sessionLogs.read(props.cwd, open).then(setTurns, (e) => setErr(clean(e))) : setTurns(null)), [open])
  if (!list) return <div className="dsg-body faint">{err || 'Reading the session logs…'}</div>
  return (
    <div className="cf-body">
      <div className="cf-col cf-sessions">
        <div className="faint">Claude Code's own logs for {props.cwd ? name(props.cwd) : 'this project'}, newest first.</div>
        {list.length === 0 && <div className="faint">No sessions logged for this folder.</div>}
        {list.map((s) => (
          <button key={s.file} className={`cf-sess ${open === s.file ? 'on' : ''}`} onClick={() => setOpen(s.file)}>
            <span className="cf-sess-top"><b>{new Date(s.at).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</b><span className="faint">{s.turns} turn{s.turns === 1 ? '' : 's'} · {s.files} file{s.files === 1 ? '' : 's'}</span>{s.failed > 0 && <span className="cf-fail">{s.failed} failed</span>}</span>
            <span className="faint cf-first">{s.first || '(no prompt)'}</span>
          </button>
        ))}
      </div>
      <div className="cf-col cf-turns">
        {!turns && <div className="faint cf-empty">Pick a session.</div>}
        {turns?.map((t, i) => (
          <div key={i} className="cf-turn">
            <div className="cf-turn-head"><span className="cf-n">{i + 1}</span><b>{t.prompt}</b><span className="faint">{t.tools} tool call{t.tools === 1 ? '' : 's'} · {t.outputTokens.toLocaleString('en-US')} tokens out</span></div>
            {t.files.length > 0 && <div className="cf-files">{t.files.map((f) => <code key={f} data-tip={f}>{name(f)}</code>)}</div>}
            {t.failed.map((f, k) => <Fragment key={k}><div className="cf-failed"><StateMark state="down" label="Failed" /><b>{f.tool}</b><span>{f.error}</span></div></Fragment>)}
          </div>
        ))}
      </div>
    </div>
  )
}
