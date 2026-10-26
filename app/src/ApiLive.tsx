import { useEffect, useRef, useState } from 'react'
import { StateMark } from './StateMark'
import type { Entry, Kind, Saved } from '../electron/realtime'

const PH: Record<Kind, string> = { ws: 'wss://echo.example.com/socket?token={{API_KEY}}', sse: 'https://api.example.com/v1/stream', sio: 'https://chat.example.com' }
const kb = (n: number) => (n >= 1e3 ? `${(n / 1e3).toFixed(1)} KB` : `${n} B`)
const hhmmss = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false }) + `.${String(t % 1000).padStart(3, '0')}`
type H = { key: string; value: string; on: boolean }

/** Phase 118: one live connection (WebSocket, SSE or Socket.IO) held in the main process, with its log. */
export function ApiLive(props: { kind: Kind; secrets: string[]; onAttach: (note: { label: string; text: string }) => void }) {
  const { kind } = props
  const id = useRef(`live-${kind}`).current
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<H[]>([])
  const [state, setState] = useState<'off' | 'busy' | 'up' | 'down'>('off')
  const [log, setLog] = useState<Entry[]>([])
  const [msg, setMsg] = useState('')
  const [event, setEvent] = useState('message')
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState<Saved[]>([])
  const [name, setName] = useState('')
  const [replay, setReplay] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.stm.live.saved().then(setSaved)
    const off = window.stm.live.onEntry((who, e) => {
      if (who !== id) return
      if ('closed' in e) return setState((s) => (s === 'up' || s === 'busy' ? 'down' : s))
      if (e.dir === 'sys' && /^Connected/.test(e.text)) setState('up')
      setLog((l) => [...l, e].slice(-1000))
    })
    return () => (off(), void window.stm.live.close(id))
  }, [id])
  useEffect(() => {
    void window.stm.live.close(id)
    setState('off'), setLog([]), setErr(''), setReplay(false), setUrl(''), setHeaders([]), setName('')
    setEvent(kind === 'sio' ? 'message' : '')
  }, [kind, id])
  useEffect(() => void (box.current && (box.current.scrollTop = box.current.scrollHeight)), [log])

  const connect = async () => {
    setErr(''), setLog([]), setReplay(false), setState('busy')
    const r = await window.stm.live.connect(id, { kind, url, headers })
    if ('error' in r) return setErr(r.error), setState('off')
  }
  const close = () => void window.stm.live.close(id)
  const send = async () => {
    if (!msg.trim()) return
    if (await window.stm.live.send(id, msg, kind === 'sio' ? event : undefined)) setMsg('')
  }
  const save = async () => setSaved(await window.stm.live.save({ id: `l${Date.now().toString(36)}`, name: name.trim(), at: Date.now(), kind, url, headers, event, log }))
  const open = (s: Saved) => (setUrl(s.url), setHeaders(s.headers), setEvent(s.event || 'message'), setLog(s.log), setReplay(true), setState('off'), setName(s.name))
  const setHeader = (i: number, patch: Partial<H>) => setHeaders((hs) => hs.map((h, k) => (k === i ? { ...h, ...patch } : h)))
  const ins = log.filter((e) => e.dir === 'in')
  const toClaude = () =>
    props.onAttach({
      label: `${kind.toUpperCase()} log`,
      text: `A ${kind === 'ws' ? 'WebSocket' : kind === 'sse' ? 'Server-Sent Events' : 'Socket.IO'} session I ran against \`${url}\` (secrets shown as {{NAME}} or masked):\n\`\`\`\n${log.slice(-80).map((e) => `${hhmmss(e.at)} ${e.dir === 'in' ? '<-' : e.dir === 'out' ? '->' : '--'} ${e.event ? `[${e.event}] ` : ''}${e.text}`).join('\n').slice(0, 12_000)}\n\`\`\``,
    })
  const mine = saved.filter((s) => s.kind === kind)

  return (
    <div className="api-body">
      <aside className="api-side">
        <div className="sp-label">Saved sessions</div>
        {mine.length === 0 && <div className="faint api-empty">Save a session to keep it here as an example.</div>}
        {mine.map((s) => (
          <div key={s.id} className="api-item">
            <button className="api-pick" onClick={() => open(s)} title={s.url}>
              <span className="api-m">{s.kind.toUpperCase()}</span>
              <span className="api-name">{s.name}</span>
            </button>
            <button className="att-x" aria-label={`Delete ${s.name}`} onClick={async () => setSaved(await window.stm.live.remove(s.id))}>×</button>
          </div>
        ))}
      </aside>
      <section className="api-main">
        <form className="api-line" onSubmit={(e) => (e.preventDefault(), state === 'up' || state === 'busy' ? close() : void connect())}>
          <span className="api-method lv-kind">{kind === 'sio' ? 'IO' : kind.toUpperCase()}</span>
          <input className="api-url" value={url} placeholder={PH[kind]} spellCheck={false} onChange={(e) => setUrl(e.target.value)} aria-label="Address" />
          <button className={state === 'up' || state === 'busy' ? '' : 'primary'} type="submit" disabled={!url.trim()}>{state === 'up' || state === 'busy' ? 'Disconnect' : 'Connect'}</button>
        </form>
        <div className="api-headers">
          {headers.map((h, i) => (
            <div key={i} className="api-header">
              <input type="checkbox" checked={h.on} onChange={(e) => setHeader(i, { on: e.target.checked })} aria-label="Use this header" />
              <input value={h.key} placeholder="Header" onChange={(e) => setHeader(i, { key: e.target.value })} />
              <input value={h.value} placeholder="Value or {{SECRET}}" onChange={(e) => setHeader(i, { value: e.target.value })} />
              <button className="att-x" aria-label="Remove header" onClick={() => setHeaders((hs) => hs.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
          <div className="api-line">
            <button className="ghost small" onClick={() => setHeaders((hs) => [...hs, { key: '', value: '', on: true }])}>Add header</button>
            <button className="ghost small" onClick={() => setHeaders((hs) => [...hs, { key: 'Authorization', value: 'Bearer {{API_KEY}}', on: true }])}>Add bearer token</button>
            <span className="spacer-flex" />
            {props.secrets.length > 0 && <span className="faint api-secrets">In the vault: {props.secrets.slice(0, 4).map((n) => `{{${n}}}`).join(' ')}{props.secrets.length > 4 ? ' …' : ''}</span>}
          </div>
        </div>
        <div className={`api-res lv ${state}`}>
          <div className="api-res-head">
            <StateMark state={state === 'busy' ? 'busy' : state} size="md" label={replay ? 'Saved session' : state === 'up' ? 'Connected' : state === 'busy' ? 'Connecting' : state === 'down' ? 'Closed' : 'Not connected'} />
            <strong className="lv-state">{replay ? 'SAVED' : state === 'up' ? 'LIVE' : state === 'busy' ? 'CONNECTING' : state === 'down' ? 'CLOSED' : 'IDLE'}</strong>
            <span className="api-meta">{ins.length} in · {log.filter((e) => e.dir === 'out').length} out · {kb(log.reduce((n, e) => n + (e.dir === 'sys' ? 0 : e.size), 0))}</span>
            {err && <span className="api-err">{err}</span>}
            <span className="spacer-flex" />
            {log.length > 0 && !replay && (
              <>
                <input className="lv-name" value={name} placeholder="Name to save it under" onChange={(e) => setName(e.target.value)} aria-label="Session name" />
                <button className="ghost small" onClick={() => void save()}>Save as example</button>
              </>
            )}
            {log.length > 0 && <button className="small" onClick={toClaude}>Send to Claude</button>}
          </div>
          <div className="lv-log" ref={box} role="log">
            {log.length === 0 && <div className="faint lv-empty">{kind === 'sse' ? 'Events from the server show here as they come.' : 'Messages both ways show here with the time and size.'}</div>}
            {log.map((e, i) => (
              <div key={i} className={`lv-row ${e.dir}`}>
                <span className="lv-time">{hhmmss(e.at)}</span>
                <span className="lv-dir">{e.dir === 'in' ? 'IN' : e.dir === 'out' ? 'OUT' : '··'}</span>
                {e.event ? <span className="lv-ev">{e.event}</span> : <span />}
                <code className="lv-text">{e.text}</code>
                <span className="lv-size">{e.dir === 'sys' ? '' : kb(e.size)}</span>
              </div>
            ))}
          </div>
          {kind !== 'sse' && (
            <form className="lv-send" onSubmit={(e) => (e.preventDefault(), void send())}>
              {kind === 'sio' && <input className="lv-event" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="event" aria-label="Event name" spellCheck={false} />}
              <input className="lv-msg" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={kind === 'sio' ? 'Text or JSON to emit' : 'Text or JSON to send'} aria-label="Message" spellCheck={false} disabled={state !== 'up'} />
              <button className="small" disabled={state !== 'up' || !msg.trim()}>{kind === 'sio' ? 'Emit' : 'Send'}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
