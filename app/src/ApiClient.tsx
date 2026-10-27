import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { ApiRequest, ApiResponse } from '../electron/apiclient'
import { highlight } from './highlight'
import { StateMark } from './StateMark'
import { ApiLive } from './ApiLive'
import { Checkbox, Select } from './ui'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const blank = (): ApiRequest => ({ id: `r${Date.now().toString(36)}`, name: '', method: 'GET', url: '', headers: [{ key: 'Accept', value: 'application/json', on: true }], body: '' })
const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`)
const pretty = (body: string, type: string) => {
  if (!/json/.test(type) && !/^\s*[[{]/.test(body)) return { text: body, lang: /html|xml/.test(type) ? 'html' : 'txt' }
  try {
    return { text: JSON.stringify(JSON.parse(body), null, 2), lang: 'json' }
  } catch {
    return { text: body, lang: 'txt' }
  }
}

/**
 * The API client: requests saved by name, {{NAME}} filled from the vault in the main process (the
 * window never holds a secret), the answer formatted, and one click to hand it to Claude.
 */
export function ApiClientSheet(props: { onClose: () => void; onAttach: (note: { label: string; text: string }) => void }) {
  const [list, setList] = useState<ApiRequest[]>([])
  const [history, setHistory] = useState<Awaited<ReturnType<typeof window.stm.api.list>>['history']>([])
  const [secrets, setSecrets] = useState<string[]>([])
  const [req, setReq] = useState<ApiRequest>(blank)
  const [tab, setTab] = useState<'headers' | 'body'>('headers')
  const [res, setRes] = useState<ApiResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'body' | 'headers'>('body')
  const [mode, setMode] = useState<'http' | 'ws' | 'sse' | 'sio'>('http')

  const load = () => void window.stm.api.list().then((d) => (setList(d.requests), setHistory(d.history), setSecrets(d.secrets)))
  useEffect(() => {
    load()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props])

  const send = async () => {
    if (!req.url.trim() || busy) return
    setBusy(true)
    setRes(null)
    setRes(await window.stm.api.send(req))
    setBusy(false)
    load()
  }
  const save = async () => setList(await window.stm.api.save({ ...req, name: req.name.trim() || `${req.method} ${req.url.replace(/^https?:\/\//, '').slice(0, 40)}` }))
  const setHeader = (i: number, patch: Partial<ApiRequest['headers'][number]>) => setReq((r) => ({ ...r, headers: r.headers.map((h, k) => (k === i ? { ...h, ...patch } : h)) }))

  const type = res?.headers.find(([k]) => k === 'content-type')?.[1] ?? ''
  const shown = res ? pretty(res.body, type) : null
  const state = busy ? 'busy' : !res ? 'off' : res.error || res.status >= 500 ? 'down' : res.status >= 400 ? 'warn' : 'up'
  const toClaude = () => {
    if (!res) return
    props.onAttach({
      label: `${req.method} ${res.status || 'error'}`,
      text: `An API call I made (secrets shown as {{NAME}}):\n\`${req.method} ${req.url}\`\n\nAnswer: ${res.error ?? `${res.status} ${res.statusText}, ${res.ms} ms, ${kb(res.size)}`}\n\`\`\`${shown?.lang ?? ''}\n${(shown?.text ?? '').slice(0, 12_000)}\n\`\`\``,
    })
    props.onClose()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet api" role="dialog" aria-label="API client">
        <header className="sheet-head">
          <div className="sheet-title">API client</div>
          <div className="segmented small" role="tablist" aria-label="Protocol">
            {([['http', 'HTTP'], ['ws', 'WebSocket'], ['sse', 'SSE'], ['sio', 'Socket.IO']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>{l}</button>)}
          </div>
          <span className="faint">Secrets go in as {'{{NAME}}'} and never reach this window</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {mode !== 'http' ? <ApiLive kind={mode} secrets={secrets} onAttach={(n) => (props.onAttach(n), props.onClose())} /> : <div className="api-body">
          <aside className="api-side">
            <button className="small" onClick={() => (setReq(blank()), setRes(null))}>New request</button>
            <div className="sp-label">Saved</div>
            {list.length === 0 && <div className="faint api-empty">Save a request to keep it here.</div>}
            {list.map((r) => (
              <div key={r.id} className={`api-item ${r.id === req.id ? 'on' : ''}`}>
                <button className="api-pick" onClick={() => (setReq(r), setRes(null))} data-tip={r.url}>
                  <span className={`api-m m-${r.method.toLowerCase()}`}>{r.method}</span>
                  <span className="api-name">{r.name}</span>
                </button>
                <button className="att-x" aria-label={`Delete ${r.name}`} onClick={async () => setList(await window.stm.api.delete(r.id))}>×</button>
              </div>
            ))}
            {history.length > 0 && <div className="sp-label">Recent</div>}
            {history.slice(0, 8).map((h) => (
              <button key={h.at} className="api-hist" data-tip={h.url} onClick={() => setReq((r) => ({ ...r, method: h.method, url: h.url }))}>
                <StateMark state={h.status === 0 || h.status >= 500 ? 'down' : h.status >= 400 ? 'warn' : 'up'} label={String(h.status || 'failed')} />
                <span className="api-m">{h.method}</span>
                <span className="api-name">{h.url.replace(/^https?:\/\//, '')}</span>
              </button>
            ))}
          </aside>
          <section className="api-main">
            <form className="api-line" onSubmit={(e) => (e.preventDefault(), void send())}>
              <Select className={`api-method m-${req.method.toLowerCase()}`} value={req.method} onChange={(e) => setReq({ ...req, method: e.target.value })} aria-label="Method">
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
              <input className="api-url" value={req.url} placeholder="https://api.example.com/v1/items?token={{API_KEY}}" spellCheck={false} onChange={(e) => setReq({ ...req, url: e.target.value })} aria-label="Address" />
              <button className="primary" type="submit" disabled={!req.url.trim() || busy}>{busy ? 'Sending' : 'Send'}</button>
            </form>
            <div className="api-line">
              <input className="api-title" value={req.name} placeholder="Name to save it under" onChange={(e) => setReq({ ...req, name: e.target.value })} aria-label="Name" />
              <button className="ghost small" onClick={() => void save()}>Save</button>
            </div>
            <div className="segmented small" role="tablist">
              <button role="tab" aria-selected={tab === 'headers'} onClick={() => setTab('headers')}>Headers</button>
              <button role="tab" aria-selected={tab === 'body'} onClick={() => setTab('body')}>Body</button>
            </div>
            {tab === 'headers' ? (
              <div className="api-headers">
                {req.headers.map((h, i) => (
                  <div key={i} className="api-header">
                    <Checkbox checked={h.on} onChange={(e) => setHeader(i, { on: e.target.checked })} aria-label="Use this header" />
                    <input value={h.key} placeholder="Header" onChange={(e) => setHeader(i, { key: e.target.value })} />
                    <input value={h.value} placeholder="Value or {{SECRET}}" onChange={(e) => setHeader(i, { value: e.target.value })} />
                    <button className="att-x" aria-label="Remove header" onClick={() => setReq((r) => ({ ...r, headers: r.headers.filter((_, k) => k !== i) }))}>×</button>
                  </div>
                ))}
                <div className="api-line">
                  <button className="ghost small" onClick={() => setReq((r) => ({ ...r, headers: [...r.headers, { key: '', value: '', on: true }] }))}>Add header</button>
                  <button className="ghost small" onClick={() => setReq((r) => ({ ...r, headers: [...r.headers, { key: 'Authorization', value: 'Bearer {{API_KEY}}', on: true }] }))}>Add bearer token</button>
                  <span className="spacer-flex" />
                  {secrets.length > 0 && <span className="faint api-secrets" data-tip={secrets.join(', ')}>In the vault: {secrets.slice(0, 4).map((n) => `{{${n}}}`).join(' ')}{secrets.length > 4 ? ' …' : ''}</span>}
                </div>
              </div>
            ) : (
              <textarea className="api-bodyin" value={req.body} placeholder={'{\n  "name": "value"\n}'} spellCheck={false} onChange={(e) => setReq({ ...req, body: e.target.value })} aria-label="Body" />
            )}
            <div className={`api-res ${state}`}>
              <div className="api-res-head">
                <StateMark state={state} size="md" label={busy ? 'Sending' : res ? (res.error ? 'Failed' : `${res.status} ${res.statusText}`) : 'Not sent yet'} />
                {res && !res.error && (
                  <>
                    <strong className="api-status">{res.status}</strong>
                    <span className="faint">{res.statusText}</span>
                    <span className="api-meta">{res.ms} ms · {kb(res.size)}</span>
                  </>
                )}
                {res?.error && <span className="api-err">{res.error}</span>}
                {!res && !busy && <span className="faint">Send to see the answer here.</span>}
                {busy && <span className="faint">Waiting for the answer…</span>}
                <span className="spacer-flex" />
                {res && !res.error && (
                  <div className="segmented small" role="tablist">
                    <button role="tab" aria-selected={view === 'body'} onClick={() => setView('body')}>Body</button>
                    <button role="tab" aria-selected={view === 'headers'} onClick={() => setView('headers')}>Headers {res.headers.length}</button>
                  </div>
                )}
                {res && <button className="small" onClick={toClaude}>Send to Claude</button>}
              </div>
              {res && !res.error && (
                <pre className="api-out">
                  <code>{view === 'body' ? highlight(shown!.text, shown!.lang) : res.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</code>
                </pre>
              )}
            </div>
          </section>
        </div>}
      </div>
    </div>
  )
}
