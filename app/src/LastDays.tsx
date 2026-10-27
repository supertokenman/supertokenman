import { useEffect, useState } from 'react'
import { briefMarkdown, SOURCE_LABEL, type BriefItem, type BriefSource } from '../shared/last30'
import type { BriefResult, SourceState } from '../electron/last30'
import { EmptyState } from './EmptyState'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'
import { Checkbox, Select } from './ui'

const SOURCES: BriefSource[] = ['reddit', 'youtube', 'hn', 'github']
const TAG: Record<BriefSource, string> = { reddit: 'Reddit', youtube: 'YouTube', hn: 'HN', github: 'GitHub' }

/**
 * "Last 30 days": what people posted about a topic, or by a public handle, in the last N days, ranked
 * by each source's own engagement, and a short brief with links. Reddit and YouTube use the person's
 * own credentials; without them the source says how to connect and is skipped.
 */
export function LastDays(props: { cwd?: string; onDraft: (title: string, brief: string) => void }) {
  const [query, setQuery] = useState('')
  const [days, setDays] = useState(30)
  const [picked, setPicked] = useState<BriefSource[]>(SOURCES)
  const [conn, setConn] = useState<{ reddit: boolean; youtube: boolean }>({ reddit: false, youtube: false })
  const [connecting, setConnecting] = useState<'' | 'reddit' | 'youtube'>('')
  const [cred, setCred] = useState({ a: '', b: '' })
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<BriefResult | null>(null)
  const [err, setErr] = useState('')
  const load = () => void window.stm.brief.sources().then(setConn, () => undefined)
  useEffect(load, [])
  const run = async () => {
    setBusy(true)
    setErr('')
    setRes(null)
    try {
      setRes(await window.stm.brief.run({ query: query.trim(), days, sources: picked, cwd: props.cwd }))
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  const saveCred = async () => {
    setErr('')
    try {
      if (connecting === 'reddit') await window.stm.brief.connectReddit(cred.a, cred.b)
      else await window.stm.brief.youtubeKey(cred.a)
      setConnecting('')
      setCred({ a: '', b: '' })
      load()
    } catch (e) {
      setErr(clean(e))
    }
  }
  const ready = (s: BriefSource) => (s === 'reddit' ? conn.reddit : s === 'youtube' ? conn.youtube : true)
  const items: BriefItem[] = res?.items ?? []
  const states: SourceState[] = res?.states ?? []
  const brief = res && 'brief' in res ? res.brief : ''
  const tokens = res && 'tokens' in res ? res.tokens : 0
  const md = brief ? briefMarkdown(query.trim(), days, brief, items) : ''
  return (
    <div className="dsg-body">
      <div className="dep-row">
        <input id="l30-query" value={query} placeholder="A topic, e.g. Bun 2, or a public handle, e.g. @simonw" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && query.trim().length >= 3 && !busy && void run()} />
        <label className="rs-num">Days<Select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n}</option>)}</Select></label>
        <button className="primary small" disabled={busy || query.trim().length < 3 || picked.length === 0} onClick={() => void run()}>{busy ? <><StateMark state="busy" label="Working" /> Gathering…</> : 'Make the brief'}</button>
      </div>
      <div className="rs-opts">
        {SOURCES.map((s) => (
          <span key={s} className="rs-kind">
            <label data-tip={ready(s) ? '' : 'Skipped until connected'}>
              <Checkbox checked={picked.includes(s)} onChange={(e) => setPicked(e.target.checked ? [...picked, s] : picked.filter((x) => x !== s))} />
              {SOURCE_LABEL[s]}
            </label>
            {!ready(s) && <button className="ghost small" onClick={() => (setConnecting(s as 'reddit' | 'youtube'), setCred({ a: '', b: '' }))}>{s === 'reddit' ? 'Connect Reddit' : 'Add API key'}</button>}
          </span>
        ))}
      </div>
      {connecting && (
        <div className="l30-connect">
          {connecting === 'reddit' ? (
            <>
              <div className="faint">Your own Reddit app (reddit.com/prefs/apps, type "script"). The app asks Reddit for an app-only token with it; both stay in the vault. Reads public posts only.</div>
              <div className="dep-row">
                <input id="l30-rid" value={cred.a} placeholder="Client id" spellCheck={false} onChange={(e) => setCred({ ...cred, a: e.target.value })} />
                <input id="l30-rsecret" type="password" value={cred.b} placeholder="Client secret" onChange={(e) => setCred({ ...cred, b: e.target.value })} />
                <button className="primary small" disabled={!cred.a || !cred.b} onClick={() => void saveCred()}>Save to vault</button>
                <button className="ghost small" onClick={() => setConnecting('')}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="faint">A YouTube Data API v3 key from your own Google Cloud project. Saved in the vault as YOUTUBE_API_KEY; video details use it too.</div>
              <div className="dep-row">
                <input id="l30-ytkey" type="password" value={cred.a} placeholder="API key" onChange={(e) => setCred({ ...cred, a: e.target.value })} />
                <button className="primary small" disabled={!cred.a} onClick={() => void saveCred()}>Save to vault</button>
                <button className="ghost small" onClick={() => setConnecting('')}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="faint">Official APIs only: Reddit and YouTube on your own credentials, Hacker News and GitHub search without. Ranked by each source's own engagement, one per address. One Claude call writes the brief; the budget brake checks it first. Public posts only, no profiles of private people.</div>
      {err && <div className="notice error">{err}</div>}
      {states.length > 0 && (
        <div className="rs-reads">
          {states.map((s) => <span key={s.source} className={`rs-read ${s.error ? 'bad' : s.skipped ? '' : 'ok'}`} data-tip={s.error ?? s.skipped ?? ''}>{TAG[s.source]} {s.skipped ? 'skipped' : s.error ? '!' : s.found}</span>)}
        </div>
      )}
      {res && 'stopped' in res && <div className="notice">{res.stopped}</div>}
      {!res && !busy && !err && (
        <EmptyState title="No brief yet" text={`Name a topic or a public handle. The app gathers what was posted in the last ${days} days, keeps the most engaged posts and writes a short brief with links.`} />
      )}
      {brief && (
        <>
          <div className="rs-check">
            <b>Brief · last {days} days</b>
            <span className="faint">{items.length} posts · about {tokens.toLocaleString('en-US')} tokens sent</span>
            <span className="spacer-flex" />
            <button className="ghost small" onClick={() => void navigator.clipboard.writeText(md).catch(() => undefined)}>Copy</button>
            <button className="primary small" onClick={() => props.onDraft(query.trim(), md)}>Draft a post from this</button>
          </div>
          <div className="rs-report">{brief.split('\n').filter((l) => l.trim()).map((l, i) => <p key={i}>{l}</p>)}</div>
        </>
      )}
      {items.length > 0 && (
        <>
          <div className="sp-label">Posts · ranked by engagement</div>
          <ol className="rs-sources">
            {items.map((i, n) => (
              <li key={i.url}>
                <span className="rs-n">{n + 1}</span>
                <span className={`rs-tag ${i.source}`}>{TAG[i.source]}</span>
                <a href={i.url} target="_blank" rel="noreferrer">{i.title || i.url}</a>
                <span className="faint">{i.measure} · {i.date.slice(0, 10)}{i.where ? ` · ${i.where}` : ''}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
