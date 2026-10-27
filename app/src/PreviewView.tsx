import { CompareView } from './Compare'
import { useEffect, useRef, useState } from 'react'
import type { Attachment } from '../shared/attach'
import { friendly } from './errors'
import { isLocalUrl } from './preview'
import { ExplainBox } from './Explain'
import { pickFile } from './FilePicker'

type Server = { url: string; id: string; command: string }
/** The webview's own methods, which the DOM types leave out. */
type View = HTMLWebViewElement & {
  reload(): void
  reloadIgnoringCache(): void
  goBack(): void
  getWebContentsId(): number
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>
  capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<{ toDataURL(): string; getSize(): { width: number; height: number } }>
  setUserAgent(ua: string): void
  getUserAgent(): string
}
const WIDTHS = { full: 0, tablet: 820, phone: 390 } as const
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
/** Sites that are not this machine get their own kept session, apart from the web apps and from localhost. */
const partitionOf = (u: string, persona?: string) => (isLocalUrl(u) ? 'preview' : persona ? `persist:browse-${persona}` : 'persist:browse')

type Log = { level: 'log' | 'warn' | 'error'; text: string; where: string; at: number }
type Net = { method: string; url: string; status?: number; error?: string; at: number }
type Picked = { selector: string; html: string; text: string; styles: Record<string, string>; rect: { x: number; y: number; width: number; height: number }; url: string }

// the element picker, run inside the page: outlines what is under the pointer, a click picks it, Escape leaves
const PICKER = `new Promise((done) => {
  const box = document.createElement('div'), tag = document.createElement('div')
  Object.assign(box.style, { position: 'fixed', pointerEvents: 'none', zIndex: 2147483647, outline: '2px solid #d97757', background: 'rgba(217,119,87,.12)' })
  Object.assign(tag.style, { position: 'fixed', pointerEvents: 'none', zIndex: 2147483647, font: '11px ui-monospace,Menlo,monospace', background: '#d97757', color: '#111', padding: '2px 6px', whiteSpace: 'nowrap' })
  document.documentElement.append(box, tag)
  const sel = (el) => {
    const parts = []
    while (el && el.nodeType === 1 && parts.length < 5) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break }
      let p = el.tagName.toLowerCase()
      if (el.classList.length) p += '.' + [...el.classList].slice(0, 2).map((c) => CSS.escape(c)).join('.')
      const same = el.parentElement ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName) : []
      if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(el) + 1) + ')'
      parts.unshift(p)
      el = el.parentElement
    }
    return parts.join(' > ')
  }
  const move = (e) => {
    const r = e.target.getBoundingClientRect()
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
    tag.textContent = sel(e.target) + '  ' + Math.round(r.width) + ' x ' + Math.round(r.height)
    Object.assign(tag.style, { left: Math.max(0, r.left) + 'px', top: Math.max(0, r.top - 20) + 'px' })
  }
  const end = (v) => { removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', key, true); box.remove(); tag.remove(); done(v) }
  const KEYS = ['display','position','width','height','margin','padding','color','background-color','font-family','font-size','font-weight','line-height','border','border-radius','gap','flex-direction','justify-content','align-items','grid-template-columns','overflow','z-index']
  const click = (e) => {
    e.preventDefault(); e.stopPropagation()
    const el = e.target, r = el.getBoundingClientRect(), cs = getComputedStyle(el), styles = {}
    for (const k of KEYS) styles[k] = cs.getPropertyValue(k)
    end({ selector: sel(el), html: el.outerHTML.slice(0, 4000), text: (el.innerText || '').slice(0, 300), styles, rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, url: location.href })
  }
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); end(null) } }
  addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', key, true)
})`

const pngOf = (dataUrl: string): Attachment => ({ kind: 'image', name: 'page.png', mediaType: 'image/png', data: dataUrl.replace(/^data:image\/png;base64,/, '') })
const short = (u: string, n = 90) => (u.length > n ? `${u.slice(0, n - 1)}…` : u)

/**
 * The panel's browser: the app being built on localhost, or any site, with the tools a developer
 * reaches for: pick an element, the console and failed requests, a marked-up screenshot, a phone
 * view. Whatever is picked goes into the message, for Claude to see.
 */
export function PreviewView({ servers, onAttach, persona }: { servers: Server[]; onAttach: (add: Attachment[], note?: { label: string; text: string }) => void; persona?: string }) {
  const [url, setUrl] = useState(servers[0]?.url ?? '')
  const [typed, setTyped] = useState(url)
  const [size, setSize] = useState<keyof typeof WIDTHS>('full')
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: false })
  const [logs, setLogs] = useState<Log[]>([])
  const [net, setNet] = useState<Net[]>([])
  const [drawer, setDrawer] = useState<'console' | 'network' | null>(null)
  const [picking, setPicking] = useState(false)
  const [shot, setShot] = useState<string | null>(null)
  const [explain, setExplain] = useState<string | null>(null)
  const ref = useRef<View>(null)
  const wcId = useRef(0)

  // a server that appears while nothing is shown is opened right away
  useEffect(() => {
    if (!url && servers[0]) {
      setUrl(servers[0].url)
      setTyped(servers[0].url)
    }
  }, [servers, url])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = () => setState({ loading: true })
    const stop = () => setState((s) => ({ ...s, loading: false }))
    const fail = (e: Event) => {
      const ev = e as Event & { errorCode: number; errorDescription: string; isMainFrame: boolean }
      if (ev.isMainFrame && ev.errorCode !== -3) setState({ loading: false, error: ev.errorDescription })
    }
    const nav = (e: Event) => setTyped((e as Event & { url: string }).url)
    const fresh = () => {
      setLogs([])
      setNet([])
    }
    const ready = () => {
      wcId.current = el.getWebContentsId()
      el.setUserAgent(size === 'phone' ? PHONE_UA : '')
    }
    const log = (e: Event) => {
      const ev = e as Event & { level: number | string; message: string; line: number; sourceId: string }
      // Electron's own warning about the page, not the page's
      if (ev.message.includes('Electron Security Warning')) return
      const lv = typeof ev.level === 'string' ? ({ error: 3, warning: 2 } as Record<string, number>)[ev.level] ?? 1 : ev.level
      setLogs((l) => [...l.slice(-199), { level: lv >= 3 ? 'error' : lv === 2 ? 'warn' : 'log', text: ev.message, where: `${ev.sourceId.split('/').pop() || ''}:${ev.line}`, at: Date.now() }])
    }
    el.addEventListener('did-start-loading', start)
    el.addEventListener('did-stop-loading', stop)
    el.addEventListener('did-fail-load', fail)
    el.addEventListener('did-navigate', nav)
    el.addEventListener('did-navigate', fresh)
    el.addEventListener('did-navigate-in-page', nav)
    el.addEventListener('dom-ready', ready)
    el.addEventListener('console-message', log)
    const off = window.stm.onBrowseNet((v) => v.wc === wcId.current && setNet((n) => [...n.slice(-199), v]))
    return () => {
      off()
      el.removeEventListener('did-start-loading', start)
      el.removeEventListener('did-stop-loading', stop)
      el.removeEventListener('did-fail-load', fail)
      el.removeEventListener('did-navigate', nav)
      el.removeEventListener('did-navigate', fresh)
      el.removeEventListener('did-navigate-in-page', nav)
      el.removeEventListener('dom-ready', ready)
      el.removeEventListener('console-message', log)
    }
  }, [url, size])

  // the phone view also tells the site it is a phone
  const setWidth = (k: keyof typeof WIDTHS) => {
    setSize(k)
    const el = ref.current
    if (!el || !wcId.current) return
    el.setUserAgent(k === 'phone' ? PHONE_UA : '')
    el.reload()
  }

  const go = (next: string) => {
    const t = next.trim()
    if (!t) return
    const u = /^https?:\/\//.test(t) ? t : /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)|^:\d+/.test(t) ? `http://${t.replace(/^:/, 'localhost:')}` : `https://${t}`
    setState({ loading: false })
    setTyped(u)
    if (u === url) ref.current?.reload()
    else setUrl(u)
  }
  const live = servers.some((v) => v.url === url)
  const local = url ? isLocalUrl(url) : true
  const errors = logs.filter((l) => l.level === 'error').length
  const failed = net.length

  const pick = async () => {
    const el = ref.current
    if (!el || picking) return
    setPicking(true)
    try {
      const p = (await el.executeJavaScript(PICKER, true)) as Picked | null
      if (!p) return
      const img = p.rect.width > 0 && p.rect.height > 0 ? await el.capturePage(p.rect).catch(() => null) : null
      const styles = Object.entries(p.styles).filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)').map(([k, v]) => `  ${k}: ${v};`).join('\n')
      const note = `This element on ${short(p.url)}:\n\`${p.selector}\` (${p.rect.width} x ${p.rect.height})\n\n\`\`\`html\n${p.html}\n\`\`\`\n\nComputed styles:\n\`\`\`css\n${styles}\n\`\`\``
      onAttach(img ? [{ ...pngOf(img.toDataURL()), name: 'element.png' }] : [], { label: p.selector.split(' > ').pop() || 'element', text: note })
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setPicking(false)
    }
  }
  const sendConsole = () => {
    const lines = logs.filter((l) => l.level !== 'log').slice(-30)
    onAttach([], { label: `Console · ${errors} errors`, text: `Console of ${short(typed)} (${errors} errors, ${lines.length - errors} warnings):\n\`\`\`\n${lines.map((l) => `[${l.level}] ${l.text}  (${l.where})`).join('\n')}\n\`\`\`` })
  }
  const sendNet = () => onAttach([], { label: `Network · ${net.length} failed`, text: `Requests that failed on ${short(typed)}:\n\`\`\`\n${net.slice(-30).map((n) => `${n.method} ${short(n.url, 140)}  ${n.status ?? n.error}`).join('\n')}\n\`\`\`` })
  // a reference picture per page: a mock, a design or the page before a change, compared with it now
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [compare, setCompare] = useState<{ reference: string; now: string } | null>(null)
  const snapshot = async () => (await ref.current?.capturePage().catch(() => null))?.toDataURL() ?? null
  const startCompare = async () => {
    const now = await snapshot()
    if (!now) return
    const reference = refs[url]
    if (!reference) {
      setRefs((r) => ({ ...r, [url]: now }))
      return
    }
    setCompare({ reference, now })
  }
  const capture = async () => {
    const img = await ref.current?.capturePage().catch(() => null)
    if (img) setShot(img.toDataURL())
  }

  return (
    <div className="preview">
      <div className="preview-bar">
        <button className="icon" data-tip="Back" aria-label="Back" disabled={!url} onClick={() => ref.current?.goBack()}>‹</button>
        <button className="icon" data-tip="Reload (Cmd+R)" aria-label="Reload" disabled={!url} onClick={() => ref.current?.reloadIgnoringCache()}>
          <span className={state.loading ? 'spin' : ''}>↻</span>
        </button>
        <form className="preview-url" onSubmit={(e) => { e.preventDefault(); go(typed) }}>
          <span className={`preview-dot ${live ? 'live' : local ? '' : 'web'}`} data-tip={live ? 'Its command is running' : local ? 'This machine' : 'A site on the web, in its own session'} role="img" aria-label={live ? 'Its command is running' : local ? 'This machine' : 'A site on the web, in its own session'} />
          <input value={typed} placeholder="localhost:3000 or any site" spellCheck={false} onChange={(e) => setTyped(e.target.value)} aria-label="Address" />
        </form>
        <div className="segmented small" role="tablist" aria-label="Width">
          {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((k) => (
            <button key={k} role="tab" aria-selected={size === k} onClick={() => setWidth(k)}>{k[0]!.toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
        <button className="ghost small" disabled={!url} data-tip="Open in your browser" onClick={() => void window.stm.openUrl(typed || url)}>Open</button>
      </div>
      {url && (
        <div className="br-tools" role="toolbar" aria-label="Developer tools">
          <button className={`br-tool ${picking ? 'on' : ''}`} onClick={() => void pick()} data-tip="Click an element on the page to send it to Claude (Esc cancels)">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M2 2h6M2 2v6M14 14H8M14 14V8" /><path d="M6 6l6 2.5-2.6 1-1 2.6z" className="fill" /></svg>
            {picking ? 'Click an element' : 'Pick'}
          </button>
          <button className="br-tool" onClick={() => void capture()} data-tip="Screenshot to mark up and send">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M2 4h3l1.5-2h3L11 4h3v9H2z" /><circle cx="8" cy="8.5" r="2.5" /></svg>
            Mark up
          </button>
          <button className="br-tool" onClick={() => void startCompare()} data-tip={refs[url] ? 'Compare the page now with its reference' : 'Keep the page as it is now as the reference to compare with later'}>
            <svg viewBox="0 0 16 16" aria-hidden><path d="M2 3h5v10H2zM9 3h5v10H9z" /><path d="M10.5 6.5h2M10.5 9.5h2" /></svg>
            {refs[url] ? 'Compare' : 'Set reference'}
          </button>
          <button className="br-tool" onClick={() => void pickFile({ title: 'A reference image', accept: ['png', 'jpg', 'jpeg', 'webp'], action: 'Use' }).then((f) => {
            if (!f) return
            const r = new FileReader()
            r.onload = () => setRefs((x) => ({ ...x, [url]: String(r.result) }))
            r.readAsDataURL(f)
          })} data-tip="Use an image (a mock or a design) as this page's reference">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M2 3h12v10H2z" /><path d="M2 11l4-4 3 3 2-2 3 3" /></svg>
            Reference image
          </button>
          <span className="spacer-flex" />
          <button className={`br-tool ${drawer === 'console' ? 'on' : ''}`} onClick={() => setDrawer(drawer === 'console' ? null : 'console')} data-tip="Console">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M2 3h12v10H2zM4.5 6.5 6.5 8l-2 1.5M8 10h3" /></svg>
            Console{errors ? <span className="br-count err">{errors}</span> : null}
          </button>
          <button className={`br-tool ${drawer === 'network' ? 'on' : ''}`} onClick={() => setDrawer(drawer === 'network' ? null : 'network')} data-tip="Failed requests">
            <svg viewBox="0 0 16 16" aria-hidden><path d="M2 5h9M8 2l3 3-3 3M14 11H5M8 8l-3 3 3 3" /></svg>
            Network{failed ? <span className="br-count err">{failed}</span> : null}
          </button>
        </div>
      )}
      {state.error && <div className="notice error">{friendly(state.error)}</div>}
      {url ? (
        <div className="preview-stage">
          <webview ref={ref} key={url} className="preview-view" src={url} partition={partitionOf(url, persona)} style={WIDTHS[size] ? { width: WIDTHS[size] } : undefined} />
        </div>
      ) : (
        <PreviewEmpty onOpen={go} />
      )}
      {drawer && (
        <div className="br-drawer">
          <div className="br-drawer-head">
            <span className="sp-label">{drawer === 'console' ? 'Console' : 'Failed requests'}</span>
            <span className="spacer-flex" />
            <button className="ghost small" onClick={() => (drawer === 'console' ? setLogs([]) : setNet([]))}>Clear</button>
            <button className="ghost small" disabled={drawer === 'console' ? !logs.some((l) => l.level !== 'log') : !net.length} data-tip="The local model explains it; free, nothing leaves the Mac" onClick={() => setExplain(drawer === 'console' ? logs.filter((l) => l.level !== 'log').slice(-30).map((l) => `[${l.level}] ${l.text} (${l.where})`).join('\n') : net.slice(-30).map((n) => `${n.method} ${n.url} ${n.status ?? n.error}`).join('\n'))}>Explain</button>
            <button className="small" disabled={drawer === 'console' ? !logs.some((l) => l.level !== 'log') : !net.length} onClick={drawer === 'console' ? sendConsole : sendNet}>Send to Claude</button>
          </div>
          <ul className="br-lines">
            {drawer === 'console'
              ? logs.length === 0
                ? <li className="faint">Nothing logged on this page yet.</li>
                : logs.slice(-80).map((l) => (
                    <li key={l.at + l.text} className={l.level}>
                      <span className="br-msg">{l.text}</span>
                      <span className="br-where">{l.where}</span>
                    </li>
                  ))
              : net.length === 0
                ? <li className="faint">No failed requests. Only errors and 4xx or 5xx answers show here.</li>
                : net.slice(-80).map((n) => (
                    <li key={n.at + n.url} className="error">
                      <span className="br-status">{n.status ?? 'ERR'}</span>
                      <span className="br-msg" data-tip={n.url}>{n.method} {n.url}</span>
                      <span className="br-where">{n.error ?? ''}</span>
                    </li>
                  ))}
          </ul>
        </div>
      )}
      {explain !== null && <ExplainBox output={explain} onClose={() => setExplain(null)} onAsk={(why) => (onAttach([], { label: 'Page errors', text: `Errors on ${short(typed)}:\n\`\`\`\n${explain}\n\`\`\`\n\nThe local model's read of it:\n${why}` }), setExplain(null))} />}
      {compare && (
        <CompareView
          reference={compare.reference}
          now={compare.now}
          page={short(typed)}
          onClose={() => setCompare(null)}
          onNewReference={() => (setRefs((r) => ({ ...r, [url]: compare.now })), setCompare(null))}
          onSend={(images, note) => {
            setCompare(null)
            onAttach(images.map((i) => ({ ...pngOf(i.png), name: i.name })), { label: 'Compare with reference', text: note })
          }}
        />
      )}
      {shot && <MarkUp src={shot} onCancel={() => setShot(null)} onSend={(png) => { setShot(null); onAttach([{ ...pngOf(png), name: 'marked-up.png' }]) }} />}
    </div>
  )
}

/** A screenshot to draw on: strokes in the accent, then it goes into the message as one image. */
function MarkUp(props: { src: string; onCancel: () => void; onSend: (png: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const c = canvas.current
      if (!c) return
      // at most 1600 wide, which keeps the image well under the 5 MB cap
      const k = Math.min(1, 1600 / img.width)
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    }
    img.src = props.src
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && props.onCancel()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [props])
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height] as const
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = canvas.current!.getContext('2d')!
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d97757'
    g.lineWidth = Math.max(3, canvas.current!.width / 320)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(...at(e))
    drawing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const g = canvas.current!.getContext('2d')!
    g.lineTo(...at(e))
    g.stroke()
  }
  return (
    <div className="br-markup" role="dialog" aria-label="Mark up the screenshot">
      <div className="br-markup-head">
        <span>Draw on what matters, then send</span>
        <span className="spacer-flex" />
        <button className="ghost small" onClick={props.onCancel}>Cancel</button>
        <button className="small primary" onClick={() => props.onSend(canvas.current!.toDataURL('image/png'))}>Send to Claude</button>
      </div>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} />
    </div>
  )
}

type Listener = Awaited<ReturnType<typeof window.stm.ports>>[number]
/** Ports that are almost never a dev server: databases, the OS and the app's own helpers. */
const NOT_WEB = new Set([5432, 3306, 6379, 27017, 11434, 8797, 9333, 53682, 5000, 7000])
/** Programs that serve web apps in development; anything else listening (helpers, agents, the app itself) is left out. */
const WEB_PROGRAMS = /^(node|bun|deno|python\d?(\.\d+)?|ruby|php|java|go|dotnet|vite|next|nuxt|astro|remix|uvicorn|gunicorn|rails|hugo|caddy|nginx|httpd|wrangler|workerd)/i

/** Nothing shown yet: what is already listening on this Mac, and how to start one here. */
function PreviewEmpty(props: { onOpen: (url: string) => void }) {
  const [found, setFound] = useState<Listener[] | null>(null)
  useEffect(() => {
    const look = () => void window.stm.ports().then((l) => setFound(l.filter((x) => !NOT_WEB.has(x.port) && x.port >= 1024 && WEB_PROGRAMS.test(x.name)).sort((a, b) => Number(b.mine) - Number(a.mine) || a.port - b.port).slice(0, 6)), () => setFound([]))
    look()
    const t = setInterval(look, 5000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="pv-empty">
      <svg className="pv-art" viewBox="0 0 220 140" aria-hidden="true">
        <path d="M8 8h204v104l-20 20H8z" className="pv-frame" />
        <path d="M8 30h204" className="pv-line" />
        <circle cx="22" cy="19" r="3.5" className="pv-dot" /><circle cx="34" cy="19" r="3.5" className="pv-dot" /><circle cx="46" cy="19" r="3.5" className="pv-dot" />
        <rect x="26" y="48" width="96" height="10" className="pv-ghost" /><rect x="26" y="66" width="150" height="6" className="pv-ghost" /><rect x="26" y="80" width="120" height="6" className="pv-ghost" />
        <rect x="8" y="31" width="204" height="3" className="pv-scan" />
      </svg>
      <div className="pv-title">Nothing to preview yet</div>
      <div className="pv-text">Start your dev server in this panel and it opens here on its own, as soon as it prints its address.</div>
      <div className="pv-run"><kbd>Cmd</kbd><kbd>Enter</kbd><span>runs a command here, like</span><code>npm run dev</code></div>
      {found && found.length > 0 && (
        <div className="pv-found">
          <div className="pv-sub">Already running on this Mac</div>
          <div className="pv-ports">
            {found.map((l) => (
              <button key={`${l.pid}:${l.port}`} className="pv-port" onClick={() => props.onOpen(`localhost:${l.port}`)} data-tip={l.command}>
                <span className="pv-num">:{l.port}</span>
                <span className="pv-name">{l.name}</span>
                <span className="pv-where">{l.cwd ? l.cwd.split('/').filter(Boolean).pop() : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
