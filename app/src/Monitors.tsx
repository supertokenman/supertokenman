import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { incidents, strip, type Monitor, type MonitorKind } from '../shared/monitors'
import type { MonitorRow } from './bridge'
import { clean } from './errors'
import './bridge'
import { Checkbox, DateTimeField, NumberField, Select } from './ui'
import { pickProjectFolder } from './FolderPicker'

const close = (
  <IconClose />
)
const pct = (r: number | null) => (r == null ? 'n/a' : `${(r * 100).toFixed(r === 1 ? 0 : 2)}%`)
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const WORD = { up: 'Up', down: 'Down', pending: 'Checking', paused: 'Paused', maintenance: 'Maintenance' }
const blank: Partial<Monitor> = { name: '', kind: 'http', target: 'https://', everySec: 60, retries: 1, timeoutMs: 10_000 }

/**
 * Monitoring: your sites, APIs and ports checked on a timer, with uptime, response time, incidents,
 * maintenance windows and a static status page; and the alarms of your own Netdata agent. Ideas from
 * uptime-kuma (MIT) and Netdata's agent API; no code from either.
 */
export function MonitorsSheet(props: { onClose: () => void }) {
  const [tab, setTab] = useState<'monitors' | 'netdata'>('monitors')
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Monitoring">
        <header className="sheet-head">
          <div className="sheet-title">Monitoring</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'monitors'} onClick={() => setTab('monitors')}>Monitors</button>
            <button role="tab" aria-selected={tab === 'netdata'} onClick={() => setTab('netdata')}>Netdata</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {tab === 'monitors' ? <Monitors /> : <Netdata />}
      </div>
    </div>
  )
}

function Monitors() {
  const [rows, setRows] = useState<MonitorRow[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Monitor> | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [title, setTitle] = useState('Status')
  const load = () => void window.stm.monitor.list().then(setRows)
  useEffect(() => {
    load()
    void window.stm.monitor.pageTitle().then(setTitle)
    return window.stm.monitor.onBeat(load)
  }, [])
  const row = rows.find((r) => r.monitor.id === pick) ?? (form ? null : rows[0])
  const act = (p: Promise<MonitorRow[]>, done = '') => void p.then((r) => (setRows(r), setErr(''), setMsg(done)), (e) => setErr(clean(e)))
  const set = (k: keyof Monitor, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const [mFrom, setMFrom] = useState('')
  const [mHours, setMHours] = useState('1')
  return (
    <div className="cf-body">
      <div className="cf-col ob-list">
        <div className="ob-row">
          <button className="primary" onClick={() => (setForm({ ...blank }), setPick(null), setErr(''))}>New monitor</button>
          <span className="spacer-flex" />
          <input className="mn-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Status page title" />
          <button disabled={!rows.length} onClick={() => void pickProjectFolder('Save the status page to').then((dir) => window.stm.monitor.page(title, dir)).then((f) => f && setMsg(`Status page saved to ${f}.`))}>Save status page</button>
        </div>
        {!rows.length && !form && <div className="faint">No monitors yet. Add a site, an API health URL or a port.</div>}
        {rows.map((r) => (
          <button key={r.monitor.id} className={`ob-turn mn-row ${r === row ? 'on' : ''}`} onClick={() => (setPick(r.monitor.id), setForm(null))}>
            <span className="ob-turn-top">
              <span className="mn-name"><span className={`mn-dot ${r.state}`} />{r.monitor.name}</span>
              <span className={`mn-state ${r.state}`}>{WORD[r.state]}</span>
            </span>
            <span className="mn-strip">{strip(r.beats).map((b, i) => <i key={i} className={b ? (b.ok ? (b.slow ? 'slow' : 'ok') : 'bad') : ''} data-tip={b ? `${when(b.at)}: ${b.msg}, ${b.ms} ms` : ''} role="img" aria-label={b ? `${when(b.at)}: ${b.msg}, ${b.ms} ms` : ''} />)}</span>
            <span className="faint">24 h {pct(r.day.ratio)}, 30 d {pct(r.month.ratio)}{r.day.avgMs != null ? `, avg ${r.day.avgMs} ms` : ''}{r.last ? `, ${r.last.msg}` : ''}</span>
          </button>
        ))}
      </div>
      <div className="cf-col">
        {form ? (
          <>
            <div className="ob-label">{form.id ? 'Edit monitor' : 'New monitor'}</div>
            <div className="mn-form">
              <label>Name<input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} /></label>
              <label>Type<Select value={form.kind} onChange={(e) => set('kind', e.target.value as MonitorKind)}><option value="http">HTTP status</option><option value="keyword">HTTP keyword</option><option value="json">HTTP JSON value</option><option value="tcp">TCP port</option><option value="promql">Prometheus query</option></Select></label>
              <label className="wide">{form.kind === 'tcp' ? 'Host:port' : form.kind === 'promql' ? 'PromQL' : 'URL'}<input value={form.target ?? ''} onChange={(e) => set('target', e.target.value)} /></label>
              {form.kind === 'json' && <label>JSON path<input placeholder="status or checks.0.ok" value={form.path ?? ''} onChange={(e) => set('path', e.target.value)} /></label>}
              {(form.kind === 'keyword' || form.kind === 'json' || form.kind === 'promql') && <label>{form.kind === 'json' ? 'Expected value' : form.kind === 'promql' ? 'Down when (such as > 0.9)' : 'Keyword'}<input value={form.keyword ?? ''} onChange={(e) => set('keyword', e.target.value)} /></label>}
              {form.kind === 'keyword' && <label className="check wide"><Checkbox checked={!!form.invert} onChange={(e) => set('invert', e.target.checked)} /> Up when the keyword is not on the page</label>}
              {form.kind !== 'tcp' && form.kind !== 'promql' && <label>Accepted codes<input placeholder="200-299" value={form.statuses ?? ''} onChange={(e) => set('statuses', e.target.value)} /></label>}
              <label>Every (seconds)<NumberField min={20} value={form.everySec ?? 60} onChange={(e) => set('everySec', Number(e.target.value))} /></label>
              <label>Retries before down<NumberField min={0} max={10} value={form.retries ?? 1} onChange={(e) => set('retries', Number(e.target.value))} /></label>
              <label>Timeout (ms)<NumberField value={form.timeoutMs ?? 10000} onChange={(e) => set('timeoutMs', Number(e.target.value))} /></label>
              <label>Slow above (ms)<NumberField placeholder="off" value={form.slowMs ?? ''} onChange={(e) => set('slowMs', Number(e.target.value))} /></label>
              {form.kind !== 'tcp' && form.kind !== 'promql' && <label>Certificate warning (days)<NumberField placeholder="off" value={form.certDays ?? ''} onChange={(e) => set('certDays', Number(e.target.value))} /></label>}
            </div>
            <div className="ob-row">
              <button className="primary" onClick={() => act(window.stm.monitor.save(form).then((r) => (setForm(null), setPick(form.id ?? r[r.length - 1]?.monitor.id ?? null), r)), 'Saved. The first check runs in a few seconds.')}>Save</button>
              <button onClick={() => setForm(null)}>Cancel</button>
            </div>
          </>
        ) : row ? (
          <>
            <div className="ob-head">
              <div className="ob-prompt">{row.monitor.name}</div>
              <div className="faint">{row.monitor.kind.toUpperCase()} {row.monitor.target}, every {row.monitor.everySec} s, down after {row.monitor.retries + 1} failures</div>
            </div>
            <div className="ob-row">
              <button onClick={() => act(window.stm.monitor.check(row.monitor.id), 'Checked.')}>Check now</button>
              <button onClick={() => setForm({ ...row.monitor })}>Edit</button>
              <button onClick={() => act(window.stm.monitor.save({ ...row.monitor, paused: !row.monitor.paused }), row.monitor.paused ? 'Resumed.' : 'Paused.')}>{row.monitor.paused ? 'Resume' : 'Pause'}</button>
              <button onClick={() => act(window.stm.monitor.remove(row.monitor.id).then((r) => (setPick(null), r)), 'Removed.')}>Remove</button>
            </div>
            <div className="mn-stats">
              <div><span className="ob-label">24 h uptime</span><b>{pct(row.day.ratio)}</b></div>
              <div><span className="ob-label">30 d uptime</span><b>{pct(row.month.ratio)}</b></div>
              <div><span className="ob-label">Avg response</span><b>{row.day.avgMs == null ? 'n/a' : `${row.day.avgMs} ms`}</b></div>
              <div><span className="ob-label">Checks 24 h</span><b>{row.day.count}</b></div>
            </div>
            <div className="ob-label">Maintenance</div>
            <div className="ob-row">
              <DateTimeField value={mFrom} onChange={(e) => setMFrom(e.target.value)} aria-label="Starts" />
              <NumberField className="mn-hours" min={1} value={mHours} onChange={(e) => setMHours(e.target.value)} aria-label="Hours" />
              <span className="faint">hours</span>
              <button disabled={!mFrom} onClick={() => { const from = new Date(mFrom).getTime(); act(window.stm.monitor.save({ ...row.monitor, maintenance: [...(row.monitor.maintenance ?? []).filter((w) => w.to > Date.now()), { from, to: from + Number(mHours) * 3_600_000 }] }), 'Maintenance window added: no alerts while it is on.') }}>Add window</button>
            </div>
            {(row.monitor.maintenance ?? []).filter((w) => w.to > Date.now()).map((w) => <div key={w.from} className="faint">{when(w.from)} to {when(w.to)}</div>)}
            <div className="ob-label">Incidents</div>
            {incidents(row.beats).slice(0, 8).map((i) => <div key={i.from} className="mn-inc"><span>{when(i.from)}</span><span className="faint">{i.to ? `${Math.max(1, Math.round((i.to - i.from) / 60_000))} min` : 'ongoing'}</span><span className="ob-sum">{i.msg}</span></div>)}
            {!incidents(row.beats).length && <div className="faint">None in the last {row.beats.length} checks.</div>}
          </>
        ) : null}
        {msg && <div className="notice">{msg}</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
    </div>
  )
}

function Netdata() {
  const [url, setUrl] = useState('')
  const [data, setData] = useState<Awaited<ReturnType<typeof window.stm.monitor.netdata>>>(null)
  const [err, setErr] = useState('')
  const load = () => void window.stm.monitor.netdata().then((d) => (setData(d), setErr('')), (e) => (setData(null), setErr(clean(e))))
  useEffect(() => {
    void window.stm.monitor.netdataUrl().then((u) => (setUrl(u), u && load()))
  }, [])
  const nums = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') || 'n/a'
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="faint">Reads alarms and a few numbers from a Netdata agent you run, such as <code>http://127.0.0.1:19999</code>. Read only; the app never changes the agent.</div>
        <div className="ob-row">
          <input className="ob-grow" placeholder="Agent URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="primary" onClick={() => void window.stm.monitor.setNetdata(url).then((u) => (setUrl(u), u ? load() : setData(null)), (e) => setErr(clean(e)))}>Save and read</button>
          {data && <button onClick={load}>Refresh</button>}
        </div>
        {err && <div className="notice error">{err}</div>}
        {data && (
          <>
            <div className="faint">{[data.host, data.os, data.version && `Netdata ${data.version}`].filter(Boolean).join(', ')}</div>
            <div className="mn-stats">
              <div><span className="ob-label">CPU %</span><b className="mn-small">{nums(data.cpu)}</b></div>
              <div><span className="ob-label">Load</span><b className="mn-small">{nums(data.load)}</b></div>
              <div><span className="ob-label">RAM MiB</span><b className="mn-small">{nums(data.ram)}</b></div>
            </div>
          </>
        )}
      </div>
      <div className="cf-col">
        <div className="ob-label">Raised alarms</div>
        {data && !data.alarms.length && <div className="faint">No warnings or critical alarms.</div>}
        {data?.alarms.map((a) => (
          <div key={a.name + a.chart} className="mn-alarm">
            <span className={`mn-state ${a.status === 'CRITICAL' ? 'down' : 'slow'}`}>{a.status === 'CRITICAL' ? 'Critical' : 'Warning'}</span>
            <span className="mn-alarm-name"><b>{a.name}</b><span className="faint">{a.chart}</span></span>
            <b className="mn-alarm-val">{a.value}</b>
            <span className="faint">{a.since ? when(a.since) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
