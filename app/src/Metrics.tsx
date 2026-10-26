import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { WINDOWS, type Alert, type Series, type Target } from '../shared/prom'
import { clean } from './errors'
import { Chart } from './Chart'
import './bridge'

const close = (
  <IconClose />
)
type Conf = Awaited<ReturnType<typeof window.stm.prom.conf>>
const ago = (iso: string) => {
  const t = Date.parse(iso)
  if (!t) return ''
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`
}
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(v * 1000) / 1000))

/**
 * Prometheus: your server's firing alerts, targets that are down, and PromQL charts, with plain words
 * turned into PromQL you see before it runs and a threshold kept as a monitor. Prometheus is Apache-2.0;
 * only its HTTP API is used.
 */
export function MetricsSheet(props: { onClose: () => void }) {
  const [tab, setTab] = useState<'alerts' | 'targets' | 'explore' | 'setup'>('alerts')
  const [conf, setConf] = useState<Conf | null>(null)
  const load = () => void window.stm.prom.conf().then((c) => (setConf(c), !c.url && setTab('setup')))
  useEffect(load, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Prometheus">
        <header className="sheet-head">
          <div className="sheet-title">Prometheus</div>
          <div className="segmented small" role="tablist">
            {(['alerts', 'targets', 'explore', 'setup'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{{ alerts: 'Alerts', targets: 'Targets', explore: 'Explore', setup: 'Connection' }[t]}</button>
            ))}
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {!conf ? <div className="dsg-body faint">Reading…</div> : tab === 'setup' ? <Setup conf={conf} done={() => (load(), setTab('alerts'))} /> : tab === 'alerts' ? <Alerts /> : tab === 'targets' ? <Targets /> : <Explore conf={conf} reload={load} />}
      </div>
    </div>
  )
}

function Setup(props: { conf: Conf; done: () => void }) {
  const [url, setUrl] = useState(props.conf.url || 'http://127.0.0.1:9090')
  const [err, setErr] = useState('')
  return (
    <div className="dsg-body">
      <div className="faint">Reads your Prometheus over its HTTP API. If it sits behind auth, keep PROMETHEUS_TOKEN (a bearer token) or PROMETHEUS_BASIC_AUTH (user:password) in the vault. {props.conf.hasToken ? 'Credentials found in the vault.' : ''}</div>
      <div className="ob-row">
        <input className="ob-grow" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Prometheus address" />
        <button className="primary" onClick={() => void window.stm.prom.setUrl(url).then(() => window.stm.prom.targets()).then(props.done, (e) => setErr(clean(e)))}>Connect</button>
      </div>
      {err && <div className="notice error">{err}</div>}
    </div>
  )
}

function Alerts() {
  const [list, setList] = useState<Alert[] | null>(null)
  const [err, setErr] = useState('')
  const load = () => void window.stm.prom.alerts().then((a) => (setList(a), setErr('')), (e) => setErr(clean(e)))
  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="dsg-body">
      <div className="ob-row"><span className="faint ob-grow">{list ? `${list.filter((a) => a.state === 'firing').length} firing, ${list.filter((a) => a.state === 'pending').length} pending. Refreshed every 30 s.` : 'Reading…'}</span><button onClick={load}>Refresh</button></div>
      {err && <div className="notice error">{err}</div>}
      {list?.map((a, i) => (
        <div key={i} className="pm-alert">
          <span className={`mn-state ${a.state === 'firing' ? 'down' : 'slow'}`}>{a.state === 'firing' ? 'Firing' : 'Pending'}</span>
          <span className="pm-alert-main"><b>{a.name}</b><span className="faint">{a.summary || Object.entries(a.labels).filter(([k]) => k !== 'alertname').map(([k, v]) => `${k}=${v}`).join(', ')}</span></span>
          <span className="faint">{a.severity}</span>
          <span className="faint">{ago(a.since)}</span>
        </div>
      ))}
      {list && !list.length && <div className="notice">No alerts firing or pending.</div>}
    </div>
  )
}

function Targets() {
  const [list, setList] = useState<Target[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.prom.targets().then(setList, (e) => setErr(clean(e))), [])
  const down = list?.filter((t) => t.health !== 'up').length ?? 0
  return (
    <div className="dsg-body">
      <div className="faint">{list ? `${list.length} targets, ${down} not up.` : 'Reading…'}</div>
      {err && <div className="notice error">{err}</div>}
      {list?.map((t, i) => (
        <div key={i} className="pm-target">
          <span className={`mn-dot ${t.health === 'up' ? 'up' : 'down'}`} />
          <span className="pm-alert-main"><b>{t.job}</b><span className="faint">{t.instance}</span></span>
          <span className={t.error ? 'pm-err' : 'faint'}>{t.error || (ago(t.lastScrape) === 'just now' ? 'scraped just now' : `scraped ${ago(t.lastScrape)} ago`)}</span>
        </div>
      ))}
    </div>
  )
}

function Explore(props: { conf: Conf; reload: () => void }) {
  const [q, setQ] = useState(props.conf.saved[0]?.query ?? 'sum by (job) (up)')
  const [win, setWin] = useState(3600)
  const [question, setQuestion] = useState('')
  const [res, setRes] = useState<{ series: Series[]; dropped: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [thr, setThr] = useState('> 0.9')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const run = (query = q, w = win) => (setBusy(true), setErr(''), void window.stm.prom.range(query, w).then(setRes, (e) => (setRes(null), setErr(clean(e)))).finally(() => setBusy(false)))
  return (
    <div className="cf-body ph-body">
      <div className="cf-col">
        <div className="ob-label">Saved</div>
        {props.conf.saved.map((s) => (
          <div key={s.name} className="s2c-item">
            <button className="ob-turn" onClick={() => (setQ(s.query), setName(s.name), run(s.query))}><span>{s.name}</span><span className="ob-turn-prompt faint">{s.query}</span></button>
            <button className="icon" aria-label={`Remove ${s.name}`} onClick={() => void window.stm.prom.unsave(s.name).then(props.reload)}>{close}</button>
          </div>
        ))}
        {!props.conf.saved.length && <div className="faint">Queries you save show here.</div>}
        <div className="ob-label">Ask in plain words</div>
        <textarea rows={3} placeholder="Requests per second by status code" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <div className="ob-row"><button disabled={!question.trim() || busy} onClick={() => (setBusy(true), void window.stm.prom.ask(question).then((x) => (setQ(x), setErr('')), (e) => setErr(clean(e))).finally(() => setBusy(false)))}>Write the PromQL</button><span className="faint">Shown before it runs.</span></div>
      </div>
      <div className="cf-col">
        <div className="ob-label">PromQL</div>
        <textarea rows={3} className="ph-sql" value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} />
        <div className="ob-row">
          <button className="primary" disabled={busy || !q.trim()} onClick={() => run()}>{busy ? 'Running…' : 'Run'}</button>
          <div className="segmented small" role="tablist">{WINDOWS.map((w) => <button key={w.id} role="tab" aria-selected={win === w.seconds} onClick={() => (setWin(w.seconds), res && run(q, w.seconds))}>{w.label}</button>)}</div>
        </div>
        {err && <div className="notice error">{err}</div>}
        {res && (res.series.some((x) => x.points.length) ? <Chart kind="line" time label={q.length > 60 ? `${q.slice(0, 60)}…` : q} series={res.series} height={260} /> : <div className="faint">No data in this window.</div>)}
        {res && res.dropped > 0 && <div className="faint">{res.dropped} more series not drawn; narrow the query with sum by (…).</div>}
        {res && (
          <>
            <div className="ob-row">
              <input className="ob-grow" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <button disabled={!name.trim()} onClick={() => void window.stm.prom.save(name, q).then(() => (props.reload(), setMsg('Saved.')))}>Save</button>
            </div>
            <div className="ob-row">
              <span className="faint">Down when the value is</span>
              <input className="mn-hours" value={thr} onChange={(e) => setThr(e.target.value)} aria-label="Threshold" />
              <button disabled={!name.trim()} onClick={() => void window.stm.monitor.save({ name, kind: 'promql', target: q, keyword: thr, everySec: 60, retries: 2 }).then(() => setMsg('Added to Monitoring; checked every minute, down after 3 checks in a row.'), (e) => setErr(clean(e)))}>Add as a monitor</button>
            </div>
          </>
        )}
        {msg && <div className="notice">{msg}</div>}
      </div>
    </div>
  )
}
