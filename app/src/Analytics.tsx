import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { chartOf, HOSTS, PRESETS, rolloutOf, type Flag, type Result } from '../shared/posthog'
import { clean } from './errors'
import { Chart } from './Chart'
import './bridge'
import { NumberField, Select } from './ui'

const close = (
  <IconClose />
)
const cell = (v: unknown) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/**
 * Product analytics on your own PostHog: ready questions and plain words turned into HogQL you see
 * before it runs, feature flags and experiments (a flag changes only after a confirm), and exceptions
 * with their stack matched to the project's files. PostHog is MIT outside ee/; only its API is used.
 */
export function AnalyticsSheet(props: { cwd?: string; sid?: string; onClose: () => void }) {
  const [tab, setTab] = useState<'ask' | 'flags' | 'errors' | 'setup'>('ask')
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.ph.state>> | null>(null)
  const load = () => void window.stm.ph.state().then((s) => (setSt(s), !s.conn.host || s.conn.projectId == null || !s.hasKey ? setTab('setup') : undefined))
  useEffect(load, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe ${!st || tab === 'setup' ? 'fit' : ''}`} role="dialog" aria-label="Product analytics">
        <header className="sheet-head">
          <div className="sheet-title">Product analytics</div>
          <div className="segmented small" role="tablist">
            {(['ask', 'flags', 'errors', 'setup'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{{ ask: 'Questions', flags: 'Flags and experiments', errors: 'Errors', setup: 'Connection' }[t]}</button>
            ))}
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {!st ? <div className="dsg-body faint">Reading…</div> : tab === 'setup' ? <Setup st={st} done={() => (load(), setTab('ask'))} /> : tab === 'ask' ? <Ask /> : tab === 'flags' ? <Flags /> : <Errors cwd={props.cwd} sid={props.sid} />}
      </div>
    </div>
  )
}

function Setup(props: { st: Awaited<ReturnType<typeof window.stm.ph.state>>; done: () => void }) {
  const [host, setHost] = useState(props.st.conn.host || HOSTS.us)
  const [projects, setProjects] = useState<{ id: number; name: string }[] | null>(null)
  const [pid, setPid] = useState<number | null>(props.st.conn.projectId)
  const [err, setErr] = useState('')
  const connect = () => void window.stm.ph.setConn({ host, projectId: pid }).then(() => window.stm.ph.projects()).then((p) => (setProjects(p), setPid((x) => x ?? p[0]?.id ?? null), setErr('')), (e) => setErr(clean(e)))
  return (
    <div className="dsg-body">
      <div className="faint">Reads your PostHog with a personal API key kept in the vault as POSTHOG_PERSONAL_API_KEY (PostHog: Settings, Personal API keys; read scopes, plus feature flag write if you want to change flags here). {props.st.hasKey ? 'The key is in the vault.' : 'The key is not in the vault yet.'}</div>
      <div className="ob-row">
        <Select value={Object.values(HOSTS).includes(host as never) ? host : 'own'} onChange={(e) => e.target.value !== 'own' && setHost(e.target.value)}>
          <option value={HOSTS.us}>PostHog Cloud US</option>
          <option value={HOSTS.eu}>PostHog Cloud EU</option>
          <option value="own">Self-hosted</option>
        </Select>
        <input className="ob-grow" value={host} onChange={(e) => setHost(e.target.value)} aria-label="Host" />
        <button className="primary" onClick={connect}>Connect</button>
      </div>
      {projects && (
        <div className="ob-row">
          <Select className="ob-grow" value={pid ?? ''} onChange={(e) => setPid(Number(e.target.value))}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <button className="primary" disabled={pid == null} onClick={() => void window.stm.ph.setConn({ host, projectId: pid }).then(props.done, (e) => setErr(clean(e)))}>Use this project</button>
        </div>
      )}
      {err && <div className="notice error">{err}</div>}
    </div>
  )
}

function Ask() {
  const [q, setQ] = useState(PRESETS[0]!.query)
  const [question, setQuestion] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = (sql = q) => (setBusy(true), setErr(''), void window.stm.ph.query(sql).then(setRes, (e) => (setRes(null), setErr(clean(e)))).finally(() => setBusy(false)))
  const chart = res ? chartOf(res) : null
  return (
    <div className="cf-body ph-body">
      <div className="cf-col">
        <div className="ob-label">Ready questions</div>
        {PRESETS.map((p) => <button key={p.id} className="ob-turn" onClick={() => (setQ(p.query), run(p.query))}><span>{p.label}</span></button>)}
        <div className="ob-label">Ask in plain words</div>
        <textarea rows={3} placeholder="How many people signed up each day this month?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <div className="ob-row"><button disabled={!question.trim() || busy} onClick={() => (setBusy(true), void window.stm.ph.ask(question).then((sql) => (setQ(sql), setErr('')), (e) => setErr(clean(e))).finally(() => setBusy(false)))}>Write the query</button><span className="faint">One call on your plan; the query shows before it runs.</span></div>
      </div>
      <div className="cf-col">
        <div className="ob-label">HogQL</div>
        <textarea rows={5} className="ph-sql" value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} />
        <div className="ob-row"><button className="primary" disabled={busy || !q.trim()} onClick={() => run()}>{busy ? 'Running…' : 'Run'}</button><span className="faint">Reads only.</span></div>
        {err && <div className="notice error">{err}</div>}
        {chart && <Chart kind={chart.kind} label={chart.label} time={chart.kind === 'line'} series={[{ name: chart.label, points: chart.x.map((x, i) => [chart.kind === 'line' ? Date.parse(x) : x, chart.y[i]!]) }]} />}
        {res && (
          <div className="ph-table">
            <table className="tbl ob-table">
              <thead><tr>{res.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{res.results.slice(0, 200).map((r, i) => <tr key={i}>{r.map((v, k) => <td key={k}>{cell(v)}</td>)}</tr>)}</tbody>
            </table>
            {!res.results.length && <div className="faint">No rows.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function Flags() {
  const [flags, setFlags] = useState<Flag[] | null>(null)
  const [exps, setExps] = useState<Awaited<ReturnType<typeof window.stm.ph.experiments>>>([])
  const [confirm, setConfirm] = useState<{ f: Flag; change: { active?: boolean; rollout?: number }; text: string } | null>(null)
  const [pct, setPct] = useState<Record<number, string>>({})
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => void Promise.all([window.stm.ph.flags(), window.stm.ph.experiments().catch(() => [])]).then(([f, e]) => (setFlags(f), setExps(e), setErr('')), (e) => setErr(clean(e)))
  useEffect(load, [])
  const apply = () => confirm && void window.stm.ph.setFlag(confirm.f.id, confirm.change).then(() => (setMsg(`${confirm.f.key}: ${confirm.text}. Done.`), setConfirm(null), load()), (e) => (setErr(clean(e)), setConfirm(null)))
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="ob-label">Feature flags</div>
        {confirm && (
          <div className="notice ob-row">
            <span className="ob-grow">{confirm.f.key}: {confirm.text}? This changes what your users see.</span>
            <button className="primary" onClick={apply}>Yes</button>
            <button onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        )}
        {flags?.map((f) => (
          <div key={f.id} className="ph-flag">
            <span className="ph-flag-name"><b>{f.key}</b><span className="faint">{f.name || ''}</span></span>
            <span className={`mn-state ${f.active ? 'up' : ''}`}>{rolloutOf(f)}</span>
            <span className="ph-flag-act">
              <NumberField className="mn-hours" min={0} max={100} placeholder="%" disabled={/conditions/.test(rolloutOf(f))} data-tip={/conditions/.test(rolloutOf(f)) ? 'This flag has conditions; change its rollout in PostHog.' : undefined} value={pct[f.id] ?? ''} onChange={(e) => setPct({ ...pct, [f.id]: e.target.value })} aria-label={`Rollout for ${f.key}`} />
              <button disabled={pct[f.id] == null || pct[f.id] === ''} onClick={() => setConfirm({ f, change: { rollout: Number(pct[f.id]), active: true }, text: `roll out to ${Number(pct[f.id])}%` })}>Set</button>
              <button className="ph-toggle" onClick={() => setConfirm({ f, change: { active: !f.active }, text: f.active ? 'turn off' : 'turn on' })}>{f.active ? 'Turn off' : 'Turn on'}</button>
            </span>
          </div>
        ))}
        {flags && !flags.length && <div className="faint">No feature flags in this project.</div>}
        {msg && <div className="notice">{msg}</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
      <div className="cf-col">
        <div className="ob-label">Experiments</div>
        {exps.map((x) => (
          <div key={x.id} className="mn-inc ph-exp">
            <span><b>{x.name}</b></span>
            <span className="faint">flag {x.feature_flag_key}</span>
            <span className={`mn-state ${x.start_date && !x.end_date ? 'up' : ''}`}>{!x.start_date ? 'Draft' : x.end_date ? 'Ended' : 'Running'}</span>
          </div>
        ))}
        {!exps.length && <div className="faint">No experiments.</div>}
        <div className="faint">Results and significance are read in PostHog; here you see what runs and the flag behind it.</div>
      </div>
    </div>
  )
}

function Errors(props: { cwd?: string; sid?: string }) {
  const [rows, setRows] = useState<Result | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [frames, setFrames] = useState<Awaited<ReturnType<typeof window.stm.ph.stack>> | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => void window.stm.ph.query(PRESETS.find((p) => p.id === 'errors')!.query).then(setRows, (e) => setErr(clean(e))), [])
  const row = pick != null ? rows?.results[pick] : null
  useEffect(() => void (row ? window.stm.ph.stack(cell(row[0]), cell(row[1]), props.cwd).then(setFrames, (e) => setErr(clean(e))) : setFrames(null)), [pick])
  return (
    <div className="cf-body">
      <div className="cf-col ob-list">
        {rows?.results.map((r, i) => (
          <button key={i} className={`ob-turn ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)}>
            <span className="ob-turn-top"><span>{cell(r[0]) || 'Error'}</span><span className="faint">{cell(r[2])} times</span></span>
            <span className="ob-turn-prompt faint">{cell(r[1])}</span>
          </button>
        ))}
        {rows && !rows.results.length && <div className="faint">No exceptions in the last 7 days.</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
      <div className="cf-col">
        {row ? (
          <>
            <div className="ob-prompt">{cell(row[0])}: {cell(row[1])}</div>
            <div className="faint">{cell(row[2])} times, last {cell(row[3]).slice(0, 16).replace('T', ' ')}</div>
            <div className="ob-label">Stack, innermost first</div>
            {frames?.map((f, i) => (
              <div key={i} className={`ph-frame ${f.inApp ? '' : 'lib'}`}>
                <span className="ob-sum">{f.fn ? `${f.fn} ` : ''}<span className="faint">{f.file}{f.line ? `:${f.line}` : ''}</span></span>
                {f.local && <span className="ph-local">{f.local}</span>}
              </div>
            ))}
            {frames && !frames.length && <div className="faint">No stack recorded for this one.</div>}
            <div className="ob-row">
              <button className="primary" disabled={!props.sid} onClick={() => {
                const top = frames?.find((f) => f.local)
                const text = `PostHog reports ${cell(row[0])}: "${cell(row[1])}", ${cell(row[2])} times in the last 7 days.${top ? ` The innermost frame in this project is ${top.local}${top.line ? ` line ${top.line}` : ''}${top.fn ? ` in ${top.fn}` : ''}.` : ''}\nStack:\n${(frames ?? []).slice(0, 12).map((f) => `- ${f.fn ?? '?'} ${f.local ?? f.file}${f.line ? `:${f.line}` : ''}`).join('\n')}\nFind the cause, fix it with a test that reproduces it, and say what you changed.`
                window.dispatchEvent(new CustomEvent('stm:prefill', { detail: { sid: props.sid, text } }))
                setMsg('Put in the panel composer; read it and send.')
              }}>Fix in the panel</button>
            </div>
            {msg && <div className="notice">{msg}</div>}
          </>
        ) : <div className="faint">Pick an exception to see its stack and the project files it touches.</div>}
      </div>
    </div>
  )
}
