import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { IconClose } from './icons'
import type { Config, Entry, Filter } from '../shared/mcpcat'
import { clean } from './errors'
import './bridge'
import { Checkbox, Select } from './ui'

const close = (
  <IconClose />
)
type Details = Awaited<ReturnType<typeof window.stm.mcat.details>>
const TONE = { ok: 'up', look: 'slow', stop: 'down' } as const

/**
 * The MCP catalog: the awesome-mcp-servers list (MIT) searchable by category, language and scope, a
 * review of each server before install (its license, who publishes it, how it runs, what it can reach),
 * and an install that keeps its keys in the vault. Each server has its own license.
 */
export function McpCatalogSheet(props: { cwd?: string; onClose: () => void }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.mcat.state>> | null>(null)
  const [f, setF] = useState<Filter>({})
  const [list, setList] = useState<Entry[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [d, setD] = useState<Details | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => void window.stm.mcat.state().then(setSt)
  useEffect(load, [])
  useEffect(() => void (st?.count ? window.stm.mcat.search(f).then(setList) : undefined), [f, st?.count])
  useEffect(() => {
    setD(null)
    setErr('')
    if (pick) void window.stm.mcat.details(pick).then(setD, (e) => setErr(clean(e)))
  }, [pick])
  const refresh = () => (setBusy(true), void window.stm.mcat.refresh().then(load, (e) => setErr(clean(e))).finally(() => setBusy(false)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe ${st?.count ? '' : 'fit'}`} role="dialog" aria-label="MCP catalog">
        <header className="sheet-head">
          <div className="sheet-title">MCP catalog</div>
          <span className="faint">{st?.count ? `${st.count.toLocaleString()} servers from awesome-mcp-servers` : ''}</span>
          <span className="spacer-flex" />
          {!!st?.count && <button className="ghost small" disabled={busy} onClick={refresh}>{busy ? 'Updating…' : 'Update list'}</button>}
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {!st ? <div className="dsg-body faint">Reading…</div> : !st.count ? (
          <EmptyState title="No catalog yet" text="The catalog comes from the awesome-mcp-servers list (MIT), downloaded once and updated when you ask. Each server is someone else's code: every install shows a review first.">
            <button className="primary" disabled={busy} onClick={refresh}>{busy ? 'Downloading…' : 'Download the list'}</button>
            {err && <div className="notice error">{err}</div>}
          </EmptyState>
        ) : (
          <div className="cf-body">
            <div className="cf-col ob-list">
              <div className="ob-row">
                <input className="ob-grow" placeholder="Search servers" value={f.q ?? ''} onChange={(e) => setF({ ...f, q: e.target.value })} />
              </div>
              <div className="ob-row">
                <Select className="ob-grow" value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value || undefined })}><option value="">All categories</option>{st.categories.map((c) => <option key={c}>{c}</option>)}</Select>
                <Select value={f.lang ?? ''} onChange={(e) => setF({ ...f, lang: e.target.value || undefined })}><option value="">Any language</option>{['TypeScript', 'Python', 'Go', 'Rust', 'C#', 'Java', 'C/C++', 'Ruby'].map((l) => <option key={l}>{l}</option>)}</Select>
                <Select value={f.scope ?? ''} onChange={(e) => setF({ ...f, scope: e.target.value || undefined })}><option value="">Local or cloud</option><option value="local">Local</option><option value="cloud">Cloud</option></Select>
              </div>
              <label className="check"><Checkbox checked={!!f.official} onChange={(e) => setF({ ...f, official: e.target.checked || undefined })} /> Official only</label>
              {list.map((e) => (
                <button key={e.repo} className={`ob-turn ${e.repo === pick ? 'on' : ''}`} onClick={() => setPick(e.repo)}>
                  <span className="ob-turn-top"><span>{e.name}{e.official ? <span className="mc-off">official</span> : null}</span><span className="faint">{[...e.langs, ...e.scope].join(' · ')}</span></span>
                  <span className="ob-turn-prompt faint">{e.description}</span>
                </button>
              ))}
              {!list.length && <div className="faint">Nothing matches.</div>}
            </div>
            <div className="cf-col">
              {!pick ? <div className="faint">Pick a server to see its review.</div> : !d ? <div className="faint">{err || 'Reading its repository…'}</div> : <ReviewView d={d} cwd={props.cwd} onDone={load} installedKeys={st.keys} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewView(props: { d: Details; cwd?: string; installedKeys: Record<string, string[]>; onDone: () => void }) {
  const { d } = props
  const [cfg, setCfg] = useState<Config>(d.config ?? { name: d.entry.repo.split('/')[1]!, type: 'stdio', command: '', args: [], env: [] })
  const [argText, setArgText] = useState((d.config?.args ?? []).join(' '))
  const [envText, setEnvText] = useState((d.config?.env ?? []).join(', '))
  const [values, setValues] = useState<Record<string, string>>({})
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const env = envText.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)
  const final: Config = { ...cfg, args: argText.trim() ? argText.trim().split(/\s+/) : [], env }
  const installed = Object.keys(props.installedKeys)
  return (
    <>
      <div className="ob-head">
        <div className="ob-prompt">{d.entry.name}</div>
        <a href={d.entry.url} target="_blank" rel="noreferrer">{d.entry.url}</a>
        <div className="faint">{d.entry.category}{d.stars != null ? `, ${d.stars.toLocaleString()} stars` : ''}{d.pushedDaysAgo != null ? `, last change ${d.pushedDaysAgo} days ago` : ''}</div>
      </div>
      <div>{d.entry.description}</div>
      <div className="ob-label">Review</div>
      <div className={`mc-review mc-lvl-${d.review.level}`}>
        {d.review.notes.map((n, i) => <div key={i} className="mc-note"><span className={`mn-state ${TONE[n.tone]}`}>{n.tone === 'ok' ? 'OK' : n.tone === 'look' ? 'Look' : 'Stop'}</span><span>{n.text}</span></div>)}
        {!d.checked.activity && <div className="faint">Activity and stars could not be read from GitHub.</div>}
      </div>
      <div className="ob-label">How it runs {d.config ? '(from its README; check it)' : '(not in its README; write it)'}</div>
      <div className="mn-form">
        <label>Name<input value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} /></label>
        <label>Type<Select value={cfg.url != null ? 'remote' : 'stdio'} onChange={(e) => setCfg(e.target.value === 'remote' ? { ...cfg, url: cfg.url ?? 'https://', type: 'http', command: undefined } : { ...cfg, url: undefined, type: 'stdio', command: cfg.command ?? '' })}><option value="stdio">Program on this machine</option><option value="remote">Remote URL</option></Select></label>
        {cfg.url != null ? (
          <label className="wide">URL<input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} /></label>
        ) : (
          <>
            <label>Command<input value={cfg.command ?? ''} onChange={(e) => setCfg({ ...cfg, command: e.target.value })} /></label>
            <label>Arguments<input value={argText} onChange={(e) => setArgText(e.target.value)} /></label>
          </>
        )}
        <label className="wide">Keys it needs (names)<input placeholder="such as GITHUB_TOKEN" value={envText} onChange={(e) => setEnvText(e.target.value)} /></label>
        {env.map((n) => <label key={n} className="wide">{n}<input type="password" placeholder="Leave empty to use the one in the vault" value={values[n] ?? ''} onChange={(e) => setValues({ ...values, [n]: e.target.value })} /></label>)}
      </div>
      <div className="ob-row">
        <div className="segmented small" role="tablist">
          <button role="tab" aria-selected={scope === 'user'} onClick={() => setScope('user')}>For me</button>
          <button role="tab" aria-selected={scope === 'project'} disabled={!props.cwd} onClick={() => setScope('project')}>This project</button>
        </div>
        <span className="spacer-flex" />
        {confirm ? (
          <>
            <span className={d.review.level === 'stop' ? 'pm-err' : 'faint'}>{d.review.level === 'stop' ? 'The review says stop. Install anyway?' : `Add ${final.name} for ${scope === 'user' ? 'every project' : 'this project'}?`}</span>
            <button className={d.review.level === 'stop' ? 'danger' : 'primary'} onClick={() => void window.stm.mcat.install({ name: final.name, scope, cwd: props.cwd ?? '', config: final, values }).then((r) => (setMsg(`Added ${r.name} to ${r.file}. New panels get it; open panels after a restart.`), setConfirm(false), setValues({}), props.onDone()), (e) => (setErr(clean(e)), setConfirm(false)))}>Install</button>
            <button onClick={() => setConfirm(false)}>Cancel</button>
          </>
        ) : (
          <button className="primary" onClick={() => (setErr(''), setConfirm(true))}>Install…</button>
        )}
      </div>
      {installed.includes(final.name.toLowerCase()) && <div className="ob-row"><span className="faint ob-grow">Installed from the catalog.</span><button onClick={() => void window.stm.mcat.uninstall(final.name.toLowerCase(), scope, props.cwd ?? '').then(() => (setMsg('Removed.'), props.onDone()), (e) => setErr(clean(e)))}>Remove</button></div>}
      {msg && <div className="notice">{msg}</div>}
      {err && <div className="notice error">{err}</div>}
      {d.readme && (
        <details className="s2c-file"><summary>README</summary><pre className="ob-pre">{d.readme}</pre></details>
      )}
    </>
  )
}
