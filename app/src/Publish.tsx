import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean, friendly } from './errors'
import { lengthOn, NETWORKS } from '../shared/publish'
import { Checkbox } from './ui'

const KEY = 'stm.publish'

/** A ring that fills as the text uses a network's limit, red past it. */
function Gauge({ used, limit }: { used: number; limit: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const p = Math.min(1, used / limit)
  const over = used > limit
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className={`pub-gauge ${over ? 'over' : p > 0.85 ? 'near' : ''}`} aria-label={`${used} of ${limit}`}>
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="track" />
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 12 12)" className="fill" />
    </svg>
  )
}

/**
 * Write once, post on each network through its own share page in the account already signed in: no paid
 * API, no token, and the user presses Post. Claude drafts from a brief and the week's commits.
 */
export function Publish(props: { focusSid: string | null; onClose: () => void }) {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}') as { text?: string; link?: string; on?: string[] }
    } catch {
      return {}
    }
  })()
  const [text, setText] = useState(saved.text ?? '')
  const [link, setLink] = useState(saved.link ?? '')
  const [on, setOn] = useState<string[]>(saved.on ?? ['linkedin', 'x', 'bluesky'])
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState<string[]>([])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ text, link, on }))
    } catch {
      // storage off: the draft lives for this session
    }
  }, [text, link, on])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const draft = async () => {
    setBusy(true)
    setErr('')
    try {
      setText(await window.stm.publishDraft(props.focusSid, brief, on))
    } catch (e) {
      setErr(clean(e))
    } finally {
      setBusy(false)
    }
  }
  const post = (id: string) => {
    const n = NETWORKS.find((x) => x.id === id)!
    const url = n.intent(text.trim(), link.trim() || undefined)
    // networks in the Apps drawer open there, in the account signed in there; the rest in the browser
    if (n.app) window.dispatchEvent(new CustomEvent('stm:webapp', { detail: { app: n.app, url } }))
    else void window.stm.openUrl(url)
    setSent((s) => [...new Set([...s, id])])
  }
  const l = link.trim() || undefined

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet publish" role="dialog" aria-label="Publish">
        <header className="sheet-head">
          <div className="sheet-title">Publish</div>
          <span className="faint">Opens each network's own post box, signed in as you. You press Post.</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body pub">
          <div className="pub-write">
            <form className="pub-brief" onSubmit={(e) => { e.preventDefault(); void draft() }}>
              <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What is it about? Empty: what you shipped this week" />
              <button className="small" disabled={busy}>{busy ? <span className="spinner" /> : 'Draft with Claude'}</button>
            </form>
            {err && <div className="notice error">{friendly(err)}</div>}
            <textarea className="pub-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the post" />
            <input className="pub-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (optional)" spellCheck={false} />
          </div>
          <div className="pub-nets">
            {NETWORKS.map((n) => {
              const used = lengthOn(n, text, l)
              const picked = on.includes(n.id)
              const over = used > n.limit
              return (
                <div key={n.id} className={`pub-net ${picked ? 'on' : ''} ${over && picked ? 'over' : ''}`}>
                  <label className="pub-pick">
                    <Checkbox checked={picked} onChange={() => setOn(picked ? on.filter((x) => x !== n.id) : [...on, n.id])} />
                    <span className="pub-name">{n.name}</span>
                  </label>
                  <Gauge used={used} limit={n.limit} />
                  <span className="faint pub-count">{n.limit < 1000 ? `${n.limit - used}` : ''}</span>
                  <button className={`small ${sent.includes(n.id) ? 'ghost' : ''}`} disabled={!picked || !text.trim() || over} onClick={() => post(n.id)}>
                    {sent.includes(n.id) ? 'Opened' : 'Post'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
