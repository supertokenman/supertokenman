import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { IconClose } from './icons'
import type { ApiRow, Auth, Gen, Op } from '../shared/api2mcp'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/^[^a-z]+/, '').slice(0, 40) || 'api'
const blankOp = (): Op => ({ tool: 'get_items', method: 'GET', path: '/items', summary: 'List the items', params: [] })

/**
 * A free API becomes an MCP server: pick one from the public-apis list (MIT), read its endpoints from its
 * OpenAPI file or write a few by hand, review the generated server, write it into the project, install
 * its packages and add it to Claude Code. The key stays in the vault.
 */
export function ApiToMcpSheet(props: { cwd?: string; onClose: () => void }) {
  const project = props.cwd ?? ''
  const [list, setList] = useState<Awaited<ReturnType<typeof window.stm.a2m.list>> | null>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [keyless, setKeyless] = useState(false)
  const [api, setApi] = useState<ApiRow | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const load = () => void window.stm.a2m.list(q, cat, keyless).then(setList, (e) => setErr(clean(e)))
  useEffect(load, [q, cat, keyless])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe ${list?.count ? '' : 'fit'}`} role="dialog" aria-label="API to MCP">
        <header className="sheet-head">
          <div className="sheet-title">API to MCP</div>
          <span className="faint">{list?.count ? `${list.count.toLocaleString()} free APIs from public-apis` : ''}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {!list ? null : !list.count ? (
          <EmptyState title="No API list yet" text="The list comes from public-apis (MIT), downloaded once. Each API has its own terms: read them before you build on one.">
            <button className="primary" disabled={!!busy} onClick={() => (setBusy('list'), void window.stm.a2m.refresh().then(load, (e) => setErr(clean(e))).finally(() => setBusy('')))}>{busy ? 'Downloading…' : 'Download the list'}</button>
            {err && <div className="notice error">{err}</div>}
          </EmptyState>
        ) : (
          <div className="cf-body">
            <div className="cf-col ob-list">
              <input placeholder="Search APIs" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="ob-row">
                <select className="ob-grow" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{list.categories.map((c) => <option key={c}>{c}</option>)}</select>
                <label className="check"><input type="checkbox" checked={keyless} onChange={(e) => setKeyless(e.target.checked)} /> No key</label>
              </div>
              {list.rows.map((r) => (
                <button key={r.url + r.name} className={`ob-turn ${r === api ? 'on' : ''}`} onClick={() => setApi(r)}>
                  <span className="ob-turn-top"><span>{r.name}</span><span className="faint">{r.auth === 'none' ? 'no key' : r.auth}{r.https ? '' : ' · http only'}</span></span>
                  <span className="ob-turn-prompt faint">{r.description}</span>
                </button>
              ))}
            </div>
            <div className="cf-col">{api ? <Builder key={api.url} api={api} project={project} /> : <div className="faint">Pick an API. Prefer ones with HTTPS and an OpenAPI file.</div>}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Builder(props: { api: ApiRow; project: string }) {
  const { api, project } = props
  const [name, setName] = useState(slug(api.name))
  const [base, setBase] = useState(api.url.replace(/\/(docs?|documentation|developers?)\/?.*$/i, '').replace(/\/$/, ''))
  const [specUrl, setSpecUrl] = useState('')
  const [ops, setOps] = useState<Op[]>([blankOp()])
  const [source, setSource] = useState('endpoints written by hand')
  const [auth, setAuth] = useState<Auth>(api.auth === 'apiKey' ? { type: 'header', name: 'x-api-key', env: `${slug(api.name).toUpperCase().replace(/-/g, '_')}_API_KEY` } : { type: 'none' })
  const [gap, setGap] = useState(1000)
  const [files, setFiles] = useState<{ path: string; content: string }[] | null>(null)
  const [step, setStep] = useState<'edit' | 'written' | 'packages' | 'done'>('edit')
  const [value, setValue] = useState('')
  const [clash, setClash] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const gen: Gen = { name, base, auth, ops, minIntervalMs: gap, source }
  const setOp = (i: number, o: Partial<Op>) => setOps(ops.map((x, k) => (k === i ? { ...x, ...o } : x)))
  const run = (label: string, p: Promise<unknown>) => (setBusy(label), setErr(''), void p.catch((e) => setErr(clean(e))).finally(() => setBusy('')))
  return (
    <>
      <div className="ob-head">
        <div className="ob-prompt">{api.name}</div>
        <a href={api.url} target="_blank" rel="noreferrer">{api.url}</a>
        <div className="faint">{api.category} · {api.auth === 'none' ? 'no key' : api.auth} · {api.https ? 'HTTPS' : 'HTTP only'}{api.auth === 'OAuth' ? ' · OAuth APIs are not generated here' : ''}</div>
      </div>
      <div className="fld-grid">
        <label className="fld"><span className="fld-label">Server name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="fld"><span className="fld-label">Base URL</span><input value={base} onChange={(e) => setBase(e.target.value)} /></label>
        <label className="fld wide"><span className="fld-label">OpenAPI file (JSON), if it has one</span>
          <span className="ob-row"><input className="ob-grow" placeholder="https://…/openapi.json" value={specUrl} onChange={(e) => setSpecUrl(e.target.value)} /><button disabled={!specUrl || !!busy} onClick={() => run('spec', window.stm.a2m.spec(specUrl).then((s) => (setOps(s.ops), s.base && setBase(s.base), setSource('its OpenAPI file'), setMsg(`Read ${s.ops.length} endpoints.`))))}>{busy === 'spec' ? 'Reading…' : 'Read endpoints'}</button></span>
        </label>
        <label className="fld"><span className="fld-label">Key</span>
          <select value={auth.type} onChange={(e) => setAuth({ ...auth, type: e.target.value as Auth['type'] })}><option value="none">No key</option><option value="header">In a header</option><option value="query">In the query</option><option value="bearer">Bearer token</option></select>
        </label>
        {(auth.type === 'header' || auth.type === 'query') && <label className="fld"><span className="fld-label">{auth.type === 'header' ? 'Header name' : 'Query parameter'}</span><input value={auth.name ?? ''} onChange={(e) => setAuth({ ...auth, name: e.target.value })} /></label>}
        {auth.type !== 'none' && <label className="fld"><span className="fld-label">Vault name</span><input value={auth.env ?? ''} onChange={(e) => setAuth({ ...auth, env: e.target.value.toUpperCase() })} /></label>}
        <label className="fld"><span className="fld-label">Wait between calls (ms)</span><input type="number" min={0} value={gap} onChange={(e) => setGap(Number(e.target.value))} /></label>
      </div>
      <div className="ob-label">Endpoints, one tool each</div>
      {ops.map((o, i) => (
        <div key={i} className="a2m-op">
          <select value={o.method} onChange={(e) => setOp(i, { method: e.target.value as Op['method'] })} aria-label="Method">{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}</select>
          <input value={o.path} onChange={(e) => setOp(i, { path: e.target.value })} aria-label="Path" />
          <input value={o.tool} onChange={(e) => setOp(i, { tool: e.target.value })} aria-label="Tool name" />
          <input value={o.params.filter((p) => p.in === 'query').map((p) => p.name).join(', ')} placeholder="query params" onChange={(e) => setOp(i, { params: [...o.params.filter((p) => p.in !== 'query'), ...e.target.value.split(/[,\s]+/).filter(Boolean).map((n) => ({ name: n, in: 'query' as const, required: false, type: 'string' as const }))] })} aria-label="Query parameters" />
          <button className="icon" aria-label="Remove endpoint" onClick={() => setOps(ops.filter((_, k) => k !== i))}>{close}</button>
        </div>
      ))}
      <div className="ob-row">
        <button onClick={() => setOps([...ops, blankOp()])}>Add endpoint</button>
        <span className="spacer-flex" />
        <button className="primary" disabled={!project || !!busy || api.auth === 'OAuth'} onClick={() => run('preview', window.stm.a2m.preview(gen).then(setFiles))}>Review the server</button>
      </div>
      {!project && <div className="notice error">Open a panel on a project first: the server is written into it.</div>}
      {files && (
        <>
          <div className="ob-label">Files to write in mcp/{name}/</div>
          {files.map((f) => <details key={f.path} className="s2c-file" open={f.path === 'server.mjs'}><summary>{f.path} <span className="faint">{f.content.split('\n').length} lines</span></summary><pre className="ob-pre">{f.content}</pre></details>)}
          <div className="ob-row">
            <button className="primary" disabled={!!busy} onClick={() => run('write', window.stm.a2m.write(project, gen, clash.length > 0).then((r) => (r.clash.length ? setClash(r.clash) : (setClash([]), setStep('written'), setMsg(`Wrote ${r.written.join(', ')}.`)))))}>{clash.length ? 'Replace them' : 'Write the files'}</button>
            {clash.length > 0 && <span className="pm-err">Already there: {clash.join(', ')}.</span>}
            {step !== 'edit' && <button disabled={!!busy} onClick={() => run('npm', window.stm.a2m.npm(project, name).then((m) => (setStep('packages'), setMsg(`npm install: ${m}`))))}>{busy === 'npm' ? 'Installing…' : 'npm install'}</button>}
          </div>
          {(step === 'packages' || step === 'done') && (
            <div className="ob-row">
              {auth.type !== 'none' && <input className="ob-grow" type="password" placeholder={`${auth.env} (leave empty if it is in the vault)`} value={value} onChange={(e) => setValue(e.target.value)} />}
              <button className="primary" disabled={!!busy} onClick={() => run('install', window.stm.a2m.install(project, name, auth.type === 'none' ? null : auth.env ?? null, value, 'project').then((r) => (setStep('done'), setValue(''), setMsg(`Added ${r.name} to ${r.file}. Check it in MCP health, then new panels get it.`))))}>Add to this project</button>
            </div>
          )}
        </>
      )}
      {msg && <div className="notice">{msg}</div>}
      {err && <div className="notice error">{err}</div>}
    </>
  )
}
