import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { slowest, tree, type Dataset, type SpanNode } from '../shared/spans'
import type { Persona } from '../shared/personas'
import type { Experiment } from './bridge'
import { clean } from './errors'
import './bridge'
import { Checkbox, Select } from './ui'

const close = (
  <IconClose />
)
type Turn = Awaited<ReturnType<typeof window.stm.obs.turns>>[number]
const ms = (n?: number) => (n == null ? '' : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`)
const usd = (n: number) => `US$ ${n.toFixed(n < 0.01 ? 4 : 3)}`
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Observability: each turn as a tree of model and tool calls with their time, a rating per turn, datasets
 * made from real turns run as experiments against a persona's production and staging instructions, and
 * the export of traces to your own Langfuse. Ideas from Langfuse (MIT); no code from it.
 */
export function ObserveSheet(props: { onClose: () => void }) {
  const [tab, setTab] = useState<'traces' | 'datasets' | 'staging' | 'export'>('traces')
  const [turns, setTurns] = useState<Turn[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const load = () => void Promise.all([window.stm.obs.turns(), window.stm.obs.datasets()]).then(([t, d]) => (setTurns(t), setDatasets(d)))
  useEffect(load, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Observability">
        <header className="sheet-head">
          <div className="sheet-title">Observability</div>
          <div className="segmented small" role="tablist">
            {(['traces', 'datasets', 'staging', 'export'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{{ traces: 'Traces', datasets: 'Datasets', staging: 'Staging', export: 'Export' }[t]}</button>
            ))}
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {tab === 'traces' ? <Traces turns={turns} datasets={datasets} reload={load} /> : tab === 'datasets' ? <Datasets datasets={datasets} reload={load} /> : tab === 'staging' ? <StagingTab /> : <ExportTab turns={turns} />}
      </div>
    </div>
  )
}

/** The turn on a time axis: each call a bar from its start to its end, nested calls indented under their tool. */
function Waterfall(props: { spans: import('../shared/spans').Span[]; t0: number; ms?: number }) {
  const rows: { n: SpanNode; depth: number }[] = []
  const walk = (l: SpanNode[], d: number) => l.forEach((n) => (rows.push({ n, depth: d }), walk(n.children, d + 1)))
  walk(tree(props.spans), 0)
  const end = Math.max(props.t0 + (props.ms ?? 0), ...props.spans.map((s) => s.end ?? s.start)) - props.t0 || 1
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / end) * 100))}%`
  return (
    <div className="ob-fall" role="img" aria-label="Calls of this turn over time">
      <div className="ob-label">Timeline, {ms(end)}</div>
      {rows.map(({ n, depth }) => {
        const a = n.start - props.t0
        const w = (n.end ?? n.start) - n.start
        return (
          <div key={n.id} className="ob-fall-row" data-tip={`${n.name} ${n.summary ?? ''}: +${ms(a)}, ${ms(w)}${n.error ? `, ${n.error}` : ''}`}>
            <span className="ob-fall-name" style={{ paddingLeft: depth * 12 }}>{n.name}</span>
            <span className="ob-fall-track"><i className={`${n.kind} ${n.error ? 'bad' : ''}`} style={{ left: pct(a), width: n.kind === 'model' ? '3px' : `max(3px, ${pct(w)})` }} /></span>
            <span className="ob-fall-ms faint">{n.kind === 'tool' ? ms(w) : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

function Node(props: { n: SpanNode; t0: number; depth: number }) {
  const { n } = props
  return (
    <>
      <div className={`ob-span ${n.error ? 'bad' : ''}`} style={{ paddingLeft: 8 + props.depth * 16 }}>
        <span className={`ob-kind ${n.kind}`}>{n.kind === 'model' ? 'Model' : 'Tool'}</span>
        <span className="ob-name" data-tip={n.name}>{n.name}</span>
        <span className="ob-sum faint">{n.kind === 'model' ? `${n.inputTokens ?? 0} in, ${n.outputTokens ?? 0} out` : n.error ?? n.summary}</span>
        <span className="ob-ms faint">+{ms(n.start - props.t0)}{n.kind === 'tool' ? `, ${n.end != null ? ms(n.end - n.start) : 'no result'}` : ''}</span>
      </div>
      {n.children.map((c) => <Node key={c.id} n={c} t0={props.t0} depth={props.depth + 1} />)}
    </>
  )
}

function Traces(props: { turns: Turn[]; datasets: Dataset[]; reload: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const t = props.turns.find((x) => x.id === pick) ?? props.turns[0]
  const rate = (v: number) => t?.id && void window.stm.obs.score(t.id, 'you', v, note).then(() => (setNote(''), setMsg(v ? 'Rated good.' : 'Rated bad.'), props.reload()))
  const addTo = (dsId: string) => {
    if (!t) return
    const ds = props.datasets.find((d) => d.id === dsId) ?? { id: '', name: `From ${when(t.at)}`, cases: [], at: 0 }
    void window.stm.obs.saveDataset({ ...ds, cases: [...ds.cases, { id: `c${ds.cases.length + 1}`, prompt: t.prompt, persona: t.persona, from: t.id }] }).then(() => (setMsg(`Added to ${ds.name}.`), props.reload()))
  }
  if (!props.turns.length) return <div className="dsg-body faint">No turns yet. Send a message in a panel and its trace shows here.</div>
  return (
    <div className="cf-body">
      <div className="cf-col ob-list">
        {props.turns.map((x) => (
          <button key={x.id ?? x.at} className={`ob-turn ${x === t ? 'on' : ''}`} onClick={() => (setPick(x.id ?? null), setMsg(''))}>
            <span className="ob-turn-top"><span>{x.persona ?? 'Panel'}</span><span className="faint">{when(x.at)}</span></span>
            <span className="ob-turn-prompt">{x.prompt || '(no prompt)'}</span>
            <span className="faint">{usd(x.costUsd)}, {ms(x.ms)}, {x.spans?.length ?? 0} spans{x.isError ? ', failed' : ''}{x.scores.you ? `, rated ${x.scores.you.value ? 'good' : 'bad'}` : ''}</span>
          </button>
        ))}
      </div>
      {t && (
        <div className="cf-col">
          <div className="ob-head">
            <div className="ob-prompt">{t.prompt}</div>
            <div className="faint">{t.model || t.spans?.find((s) => s.kind === 'model')?.name || 'model'}, {t.inputTokens} in, {t.outputTokens} out, {t.cacheRead} cached, {usd(t.costUsd)}, {ms(t.ms)}</div>
          </div>
          {!!t.spans?.length && <Waterfall spans={t.spans} t0={t.at} ms={t.ms} />}
          <div className="ob-label">Span tree</div>
          <div className="ob-tree">{t.spans?.length ? tree(t.spans).map((n) => <Node key={n.id} n={n} t0={t.at} depth={0} />) : <div className="faint">No spans recorded for this turn.</div>}</div>
          {!!t.spans?.length && (
            <>
              <div className="ob-label">Slowest tools</div>
              <div className="faint">{slowest(t.spans).map((s) => `${s.name} ${ms(s.end! - s.start)}`).join(', ') || 'None.'}</div>
            </>
          )}
          <div className="ob-label">Your rating</div>
          <div className="ob-row">
            <input className="ob-grow" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={t.scores.you?.value === 1 ? 'primary' : ''} onClick={() => rate(1)}>Good</button>
            <button className={t.scores.you?.value === 0 ? 'primary' : ''} onClick={() => rate(0)}>Bad</button>
          </div>
          {t.scores.you?.note && <div className="faint">Note: {t.scores.you.note}</div>}
          <div className="ob-label">Add to a dataset</div>
          <div className="ob-row">
            {props.datasets.map((d) => <button key={d.id} onClick={() => addTo(d.id)}>{d.name}</button>)}
            <button onClick={() => addTo('')}>New dataset</button>
          </div>
          {msg && <div className="notice">{msg}</div>}
        </div>
      )}
    </div>
  )
}

function Datasets(props: { datasets: Dataset[]; reload: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const [personas, setPersonas] = useState<Persona[]>([])
  const [staging, setStaging] = useState<Record<string, unknown>>({})
  const [persona, setPersona] = useState('')
  const [must, setMust] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [exp, setExp] = useState<Experiment[]>([])
  useEffect(() => void Promise.all([window.stm.personas.list(), window.stm.obs.staging(), window.stm.obs.experiments()]).then(([p, s, e]) => (setPersonas(p), setStaging(s), setExp(e), setPersona((x) => x || p[0]?.id || ''))), [])
  const ds = props.datasets.find((d) => d.id === pick) ?? props.datasets[0]
  const save = (next: Dataset) => void window.stm.obs.saveDataset(next).then(props.reload)
  const run = () => {
    if (!ds || !persona) return
    setBusy(true)
    setErr('')
    const variants = [{ name: 'production', personaId: persona, use: 'production' as const }, ...(staging[persona] ? [{ name: 'staging', personaId: persona, use: 'staging' as const }] : [])]
    void window.stm.obs.run(ds.id, variants, must.split(',').map((x) => x.trim()).filter(Boolean)).then((e) => setExp((l) => [e, ...l]), (e) => setErr(clean(e))).finally(() => setBusy(false))
  }
  if (!props.datasets.length) return <div className="dsg-body faint">No datasets yet. In Traces, add a turn to a new dataset.</div>
  const last = exp.find((e) => e.datasetId === ds?.id)
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="ob-row">
          <Select value={ds?.id} onChange={(e) => setPick(e.target.value)}>{props.datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          {ds && <input className="ob-grow" value={ds.name} onChange={(e) => save({ ...ds, name: e.target.value })} aria-label="Dataset name" />}
          {ds && <button onClick={() => void window.stm.obs.deleteDataset(ds.id).then(props.reload)}>Delete</button>}
        </div>
        {ds?.cases.map((c, i) => (
          <div key={c.id} className="ob-case">
            <div className="ob-row"><span className="ob-label">Case {i + 1}</span><span className="spacer-flex" /><button className="link" onClick={() => save({ ...ds, cases: ds.cases.filter((x) => x.id !== c.id) })}>Remove</button></div>
            <div className="ob-case-prompt">{c.prompt}</div>
            <textarea rows={2} placeholder="Expected answer (optional, for ROUGE-L)" defaultValue={c.expected ?? ''} onBlur={(e) => save({ ...ds, cases: ds.cases.map((x) => (x.id === c.id ? { ...x, expected: e.target.value } : x)) })} />
          </div>
        ))}
      </div>
      <div className="cf-col">
        <div className="faint">Runs each case once on your Claude plan, against the persona's production instructions and, when it has one, its staging version. The budget brake checks every call.</div>
        <div className="ob-row">
          <Select value={persona} onChange={(e) => setPersona(e.target.value)}>{personas.map((p) => <option key={p.id} value={p.id}>{p.name}{staging[p.id] ? ' (has staging)' : ''}</option>)}</Select>
          <input className="ob-grow" placeholder="Checks, comma separated: @numbered, total, /regex/" value={must} onChange={(e) => setMust(e.target.value)} />
        </div>
        <div className="ob-row">
          <button className="primary" disabled={busy || !ds?.cases.length} onClick={run}>{busy ? 'Running…' : `Run ${ds?.cases.length ?? 0} ${ds?.cases.length === 1 ? 'case' : 'cases'}`}</button>
          {busy && <button onClick={() => void window.stm.obs.stop()}>Stop</button>}
        </div>
        {err && <div className="notice error">{err}</div>}
        {last && (
          <>
            <div className="ob-label">Last run, {when(last.at)}</div>
            <table className="tbl ob-table">
              <thead><tr><th>Variant</th><th>Checks passed</th><th>ROUGE-L</th><th>Cost</th><th>Avg time</th><th>Errors</th></tr></thead>
              <tbody>{last.summary.map((r) => <tr key={r.variant}><td>{r.variant}</td><td>{Math.round(r.passRate * 100)}%</td><td>{r.rouge == null ? 'n/a' : r.rouge.toFixed(2)}</td><td>{usd(r.costUsd)}</td><td>{ms(r.ms)}</td><td>{r.errors}</td></tr>)}</tbody>
            </table>
            {last.results.filter((r) => r.error).map((r) => <div key={`${r.variant}${r.caseId}`} className="notice error">{r.variant}, {r.caseId}: {r.error}</div>)}
          </>
        )}
      </div>
    </div>
  )
}

function StagingTab() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [staging, setStaging] = useState<Awaited<ReturnType<typeof window.stm.obs.staging>>>({})
  const [pick, setPick] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => void Promise.all([window.stm.personas.list(), window.stm.obs.staging()]).then(([p, s]) => (setPersonas(p), setStaging(s), setPick(p[0]?.id ?? ''))), [])
  const p = personas.find((x) => x.id === pick)
  useEffect(() => {
    setText(staging[pick]?.instructions ?? p?.instructions ?? '')
    setNote(staging[pick]?.note ?? '')
  }, [pick, p, staging])
  const act = (x: Promise<typeof staging>, done: string) => void x.then((s) => (setStaging(s), setMsg(done), setErr('')), (e) => setErr(clean(e)))
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="faint">A staging version of a persona's instructions sits beside production. Panels keep using production; experiments in Datasets run both. Promote copies staging into production and keeps the old text in the persona's history.</div>
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>{personas.map((x) => <option key={x.id} value={x.id}>{x.name}{staging[x.id] ? ' (staging)' : ''}</option>)}</Select>
        <div className="ob-label">Production</div>
        <pre className="ob-pre">{p?.instructions || '(empty)'}</pre>
      </div>
      <div className="cf-col">
        <div className="ob-label">{staging[pick] ? `Staging, saved ${when(staging[pick]!.at)}` : 'Staging'}</div>
        <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
        <input placeholder="What changed" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="ob-row">
          <button className="primary" onClick={() => act(window.stm.obs.setStaging(pick, { instructions: text, note }), 'Staging saved.')}>Save staging</button>
          <button disabled={!staging[pick]} onClick={() => act(window.stm.obs.promote(pick).then((s) => (void window.stm.personas.list().then(setPersonas), s)), 'Promoted to production.')}>Promote to production</button>
          <button disabled={!staging[pick]} onClick={() => act(window.stm.obs.setStaging(pick, null), 'Staging removed.')}>Discard</button>
        </div>
        {msg && <div className="notice">{msg}</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
    </div>
  )
}

function ExportTab(props: { turns: Turn[] }) {
  const [o, setO] = useState<Awaited<ReturnType<typeof window.stm.obs.otel>> | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.obs.otel().then(setO), [])
  if (!o) return <div className="dsg-body faint">Reading…</div>
  const save = (next: typeof o) => void window.stm.obs.setOtel(next).then((x) => (setO(x), setErr('')), (e) => setErr(clean(e)))
  const test = () => void window.stm.obs.export(props.turns.slice(0, 5).map((t) => t.id ?? '')).then((r) => (r.ok ? (setMsg(`Sent ${Math.min(5, props.turns.length) === 1 ? '1 turn' : `${Math.min(5, props.turns.length)} turns`}: HTTP ${r.status}.`), setErr('')) : setErr(r.error ?? `HTTP ${r.status}`)))
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="faint">Sends each turn as an OpenTelemetry trace to a collector you run, such as your own Langfuse at <code>https://your-host/api/public/otel/v1/traces</code>. Off by default. Keys come from the vault: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.</div>
        <label className="check"><Checkbox checked={o.on} onChange={(e) => save({ ...o, on: e.target.checked })} /> Export after each turn</label>
        <label className="check"><Checkbox checked={o.withText} onChange={(e) => save({ ...o, withText: e.target.checked })} /> Include prompts and tool inputs (off: only names, timing, tokens and cost)</label>
        <input placeholder="Endpoint URL" defaultValue={o.endpoint} onBlur={(e) => save({ ...o, endpoint: e.target.value })} />
        <div className="ob-row"><button disabled={!o.endpoint || !props.turns.length} onClick={test}>Send the last 5 turns now</button></div>
        {msg && <div className="notice">{msg}</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
    </div>
  )
}
