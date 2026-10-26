import { useEffect, useRef, useState } from 'react'
import { framed, htmlOf, readAsk } from '../shared/mcpapps'
import { clean } from './errors'

type ToolLite = { name: string; cls: 'read' | 'write' }
type Pending = { kind: 'call'; id: number | string; name: string; args: Record<string, unknown> } | { kind: 'link'; id: number | string; url: string }

/**
 * A tool's own page (MCP Apps): sandboxed with scripts only, no same-origin, no network (CSP). It gets
 * the tool's input and result, may call tools of the same server (write tools ask first) and may ask to
 * open an https link (a click opens it). Nothing else.
 */
export function McpAppFrame(props: { uri: string; tools: ToolLite[]; input: Record<string, unknown>; result: unknown }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [doc, setDoc] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [height, setHeight] = useState(240)
  const [pending, setPending] = useState<Pending | null>(null)
  const [log, setLog] = useState<string[]>([])
  const note = (s: string) => setLog((l) => [...l.slice(-4), s])
  useEffect(() => {
    void window.stm.insp.resource(props.uri).then((r) => {
      const html = htmlOf(r as Parameters<typeof htmlOf>[0])
      if (html) void window.stm.insp.appDoc(framed(html)).then(setDoc)
      else setErr(`${props.uri} is not an HTML page.`)
    }, (e) => setErr(clean(e)))
  }, [props.uri])
  const send = (m: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ jsonrpc: '2.0', ...m }, '*')
  const run = (p: Extract<Pending, { kind: 'call' }>, confirmed: boolean) =>
    void window.stm.insp.call(p.name, p.args, confirmed).then(
      (r) => (note(`Called ${p.name}`), send({ id: p.id, result: r.result })),
      (e) => send({ id: p.id, error: { code: -32000, message: clean(e) } }),
    )
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const a = readAsk(e.data, props.tools.map((t) => t.name))
      if (a.kind === 'ignore') return
      if (a.kind === 'size') return setHeight(a.height)
      if (a.kind === 'refuse') return note(a.why), send({ id: a.id, error: { code: -32601, message: a.why } })
      if (a.kind === 'initialize') {
        const theme = (localStorage.getItem('stm.theme') ?? '').includes('dark') ? 'dark' : 'light'
        send({ id: a.id, result: { protocolVersion: '2025-06-18', hostInfo: { name: 'SuperTokenMan', version: '1' }, hostCapabilities: { openLinks: {}, serverTools: {} }, hostContext: { theme, displayMode: 'inline' } } })
        send({ method: 'ui/notifications/tool-input', params: { arguments: props.input } })
        send({ method: 'ui/notifications/tool-result', params: props.result })
        return
      }
      if (a.kind === 'message') return note('The page asked to post a message; the inspector has no chat.'), send({ id: a.id, error: { code: -32601, message: 'No chat here.' } })
      if (a.kind === 'call') {
        const t = props.tools.find((x) => x.name === a.name)
        return t?.cls === 'write' ? setPending(a) : run(a, false)
      }
      if (a.kind === 'link') setPending(a)
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [props.tools, props.input, props.result])
  if (err) return <div className="notice error">{err}</div>
  if (!doc) return <div className="faint">Loading the tool's page...</div>
  return (
    <div className="mapp">
      <div className="mapp-bar"><span className="chart-name">App</span><span className="faint">{props.uri} · sandboxed, no network</span></div>
      <iframe ref={frame} className="mapp-frame" title={`App for ${props.uri}`} sandbox="allow-scripts" src={doc} style={{ height }} referrerPolicy="no-referrer" />
      {pending?.kind === 'call' && (
        <div className="notice ob-row"><span className="ob-grow">The page wants to run {pending.name}, which can change things. Run it?</span><button className="danger" onClick={() => (run(pending, true), setPending(null))}>Run</button><button onClick={() => (send({ id: pending.id, error: { code: -32001, message: 'Declined.' } }), setPending(null))}>Cancel</button></div>
      )}
      {pending?.kind === 'link' && (
        <div className="notice ob-row"><span className="ob-grow">The page wants to open {pending.url}</span><button onClick={() => (void window.stm.link.open(pending.url), send({ id: pending.id, result: {} }), setPending(null))}>Open</button><button onClick={() => (send({ id: pending.id, error: { code: -32001, message: 'Declined.' } }), setPending(null))}>Cancel</button></div>
      )}
      {log.length > 0 && <div className="faint mapp-log">{log.join(' · ')}</div>}
    </div>
  )
}
