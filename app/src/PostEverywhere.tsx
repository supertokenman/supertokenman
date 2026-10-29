import { useEffect, useState } from 'react'
import type { PostNet } from './bridge'
import { ACCOUNT_NAME as NET_NAME } from '../shared/accounts'
import { preview, type Result } from '../shared/posteverywhere'
import type { Net as NetId } from '../shared/social'
import { Accounts } from './Accounts'
import { IconClose } from './icons'
import { clean } from './errors'
import { Checkbox, confirmDialog } from './ui'

/** One post, a preview per connected network, and each network's own API after you confirm. */
export function PostEverywhere(props: { onClose: () => void; text?: string; title?: string }) {
  const [nets, setNets] = useState<PostNet[]>([])
  const [text, setText] = useState(props.text ?? '')
  const [title, setTitle] = useState(props.title ?? '')
  const [pick, setPick] = useState<Set<NetId>>(new Set())
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const [msg, setMsg] = useState('')
  // newly connected networks start ticked; disconnected ones drop out
  const got = (l: PostNet[]) => setNets((old) => {
    setPick((p) => new Set(l.filter((x) => x.connected && (p.has(x.net) || !old.find((o) => o.net === x.net)?.connected)).map((x) => x.net)))
    return l
  })
  useEffect(() => {
    if (props.text !== undefined) setText(props.text)
    if (props.title !== undefined) setTitle(props.title)
  }, [props.text, props.title])
  const connected = nets.filter((n) => n.connected)
  const pv = (n: PostNet) => preview(n.net, text, title, n.net === 'mastodon' && n.mastodonLimit ? n.mastodonLimit : undefined)
  const chosen = connected.filter((n) => pick.has(n.net))
  const blocked = chosen.filter((n) => !pv(n).ok)
  const post = async () => {
    const list = chosen.map((n) => `${NET_NAME[n.net]} (${n.host})`).join('\n')
    if (!(await confirmDialog({ title: 'Post now?', message: `This text goes out now, as a public post where the network makes it public, to:\n\n${list}\n\nNothing else gets it.`, confirm: `Post to ${chosen.length}` }))) return
    setBusy(true)
    setResults(null)
    window.stm.post.send(chosen.map((n) => n.net), text, title).then(setResults, (e) => setMsg(clean(e))).finally(() => setBusy(false))
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config" role="dialog" aria-label="Post everywhere">
        <header className="sheet-head">
          <div className="sheet-title">Post everywhere</div>
          <span className="faint">one text, sent by this Mac to each network you connect, through its own API</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="pe-body" style={{ display: 'grid', gap: 12, padding: 16, overflow: 'auto' }}>
          <label className="chart-name" htmlFor="pe-text">Post</label>
          <textarea id="pe-text" rows={6} value={text} onChange={(e) => (setText(e.target.value), setResults(null))} placeholder="Text and links. No images in this version." />
          {pick.has('devto') && <input aria-label="Title for DEV" value={title} placeholder="Title (DEV only)" onChange={(e) => setTitle(e.target.value)} />}
          {!connected.length && <div className="faint">No network is connected. Connect one below; each is off until you do.</div>}
          {connected.map((n) => {
            const p = pv(n)
            const r = results?.find((x) => x.net === n.net)
            return (
              <section key={n.net} style={{ display: 'grid', gap: 4 }}>
                <label className="ca-toggle">
                  <Checkbox checked={pick.has(n.net)} onChange={(e) => setPick((s) => { const x = new Set(s); if (e.target.checked) x.add(n.net); else x.delete(n.net); return x })} />
                  <b>{NET_NAME[n.net]}</b>
                  <span className="faint">{n.host} · {p.count}{p.limit !== null ? ` / ${p.limit}` : ''}</span>
                </label>
                {pick.has(n.net) && text.trim() && <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }} className="faint">{n.net === 'devto' ? `${title}\n\n${p.text}` : p.text}</pre>}
                {pick.has(n.net) && p.problem && text.trim() && <div className="error">{p.problem}</div>}
                {r && (r.ok ? <div>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a> : 'Posted.'}</div> : <div className="error">{r.error}</div>)}
              </section>
            )
          })}
          <div className="ob-row">
            <button className="primary" disabled={busy || !chosen.length || !!blocked.length || !text.trim()} onClick={() => void post()}>{busy ? 'Posting…' : `Post to ${chosen.length} network${chosen.length === 1 ? '' : 's'}`}</button>
            {!!blocked.length && <span className="faint">Fix or untick {blocked.map((n) => NET_NAME[n.net]).join(', ')} first.</span>}
          </div>
          {msg && <div className="error">{msg}</div>}
          <Accounts onChange={got} />
        </div>
      </div>
    </div>
  )
}
