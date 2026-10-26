import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { Chart } from './Chart'
import type { Limits } from '../shared/budget'
import { count } from '../shared/plural'
import './bridge'

type Data = Awaited<ReturnType<typeof window.stm.budget.get>>

const FIELDS: { key: keyof Limits; label: string; what: string }[] = [
  { key: 'panelUsd', label: 'Per panel', what: 'One panel, from when it opened.' },
  { key: 'projectDayUsd', label: 'Per project, per day', what: 'Every panel in one folder, today.' },
  { key: 'personaDayUsd', label: 'Per persona, per day', what: 'Every panel of one persona, today.' },
  { key: 'approveTurnUsd', label: 'Ask before a turn above', what: 'A single turn expected to cost more than this asks first.' },
]

/**
 * Budgets with a brake: limits per panel, project and persona, and the turn that asks first. A message
 * that would cross one waits in its panel until you send it anyway or drop it.
 */
export function BudgetSheet(props: { onClose: () => void; usdToBrl: number; panels: { sid: string; name: string }[] }) {
  const [data, setData] = useState<Data | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [warnAt, setWarnAt] = useState('80')
  const [saved, setSaved] = useState('')
  const rate = props.usdToBrl || 1
  const money = (usd: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(usd * rate)

  useEffect(() => {
    void window.stm.budget.get().then((d) => {
      setData(d)
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, d.limits[f.key] ? (Number(d.limits[f.key]) * rate).toFixed(2) : ''])))
      setWarnAt(String(Math.round((d.limits.warnAt ?? 0.8) * 100)))
    })
  }, [rate])

  const save = async () => {
    const toUsd = (v: string) => {
      const n = Number(v.replace(',', '.'))
      return Number.isFinite(n) && n > 0 ? n / rate : undefined
    }
    const limits: Limits = { panelUsd: toUsd(draft.panelUsd ?? ''), projectDayUsd: toUsd(draft.projectDayUsd ?? ''), personaDayUsd: toUsd(draft.personaDayUsd ?? ''), approveTurnUsd: toUsd(draft.approveTurnUsd ?? ''), warnAt: Math.min(0.99, Math.max(0.1, Number(warnAt) / 100 || 0.8)) }
    await window.stm.budget.set(limits)
    setData(await window.stm.budget.get())
    setSaved('Saved. The next message in every panel is checked against these.')
  }

  const projects = Object.entries(data?.spend.project ?? {}).sort((a, b) => b[1] - a[1])
  const personas = Object.entries(data?.spend.persona ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet budget" role="dialog" aria-label="Budgets">
        <header className="sheet-head">
          <div className="sheet-title">Budgets</div>
          <span className="faint">A message that would cross a limit waits in its panel until you decide</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="bg-body">
          <section className="bg-limits">
            <div className="sp-label">Limits (R$, empty means none)</div>
            {FIELDS.map((f) => (
              <label key={f.key} className="bg-field">
                <span className="bg-name">{f.label}</span>
                <span className="bg-what faint">{f.what}</span>
                <input id={`bg-${f.key}`} inputMode="decimal" placeholder="none" value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              </label>
            ))}
            <label className="bg-field">
              <span className="bg-name">Warn at</span>
              <span className="bg-what faint">A note in the panel once this share of a limit is spent.</span>
              <span className="bg-pct">
                <input id="bg-warn" inputMode="numeric" value={warnAt} onChange={(e) => setWarnAt(e.target.value)} />%
              </span>
            </label>
            <div className="bg-actions">
              {saved && <span className="faint">{saved}</span>}
              <button className="primary small" onClick={() => void save()}>Save limits</button>
            </div>
          </section>
          <section className="bg-today">
            <div className="sp-label">Today</div>
            {!projects.length && <div className="faint">Nothing spent yet today.</div>}
            {projects.map(([cwd, usd]) => (
              <Row key={cwd} name={cwd.split('/').filter(Boolean).slice(-2).join('/')} usd={usd} limit={data?.limits.projectDayUsd} money={money} />
            ))}
            {personas.length > 0 && <div className="sp-label">By persona</div>}
            {personas.map(([id, usd]) => (
              <Row key={id} name={id} usd={usd} limit={data?.limits.personaDayUsd} money={money} />
            ))}
            {props.panels.length > 0 && <div className="sp-label">Open panels</div>}
            {props.panels.map((p) => {
              const c = data?.panels[p.sid]
              return <Row key={p.sid} name={p.name} usd={c?.total ?? 0} limit={data?.limits.panelUsd} money={money} note={c?.next ? `next turn about ${money(c.next)}` : undefined} />
            })}
          </section>
          {props.panels.length > 0 && <TurnBand panels={props.panels} />}
          <CustomEndpoint />
        </div>
      </div>
    </div>
  )
}

/** Phase 106: a panel's turns against the normal band of its project and model. */
function TurnBand(props: { panels: { sid: string; name: string }[] }) {
  const [sid, setSid] = useState(props.panels[0]!.sid)
  const [metric, setMetric] = useState<'cost' | 'tokens' | 'seconds'>('cost')
  const [data, setData] = useState<Awaited<ReturnType<typeof window.stm.anomalySeries>> | null>(null)
  useEffect(() => void window.stm.anomalySeries(sid).then(setData), [sid])
  const pts = (data?.samples ?? []).slice(-60).map((x, i) => [i + 1, x[metric]] as [number, number])
  const b = data?.bands[metric]
  const over = pts.filter(([, v]) => b && v > b.high).length
  return (
    <section className="bg-section">
      <div className="sp-label">Turns against the usual</div>
      <div className="ob-row">
        <select value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Panel">{props.panels.map((p) => <option key={p.sid} value={p.sid}>{p.name}</option>)}</select>
        <div className="segmented" role="tablist">
          {(['cost', 'tokens', 'seconds'] as const).map((m) => <button key={m} role="tab" aria-selected={metric === m} onClick={() => setMetric(m)}>{m === 'cost' ? 'Cost' : m === 'tokens' ? 'Tokens' : 'Time'}</button>)}
        </div>
      </div>
      {pts.length < 8 ? <div className="faint">{data?.key.split('|')[0]} has {count(pts.length, 'turn')} on this model so far; the usual band needs 8.</div> : (
        <>
          <Chart kind="line" label={`${metric} per turn`} unit={metric === 'cost' ? 'US$' : metric === 'tokens' ? 'tokens' : 's'} height={150} series={[{ name: 'Turn', points: pts }, { name: 'Usual', points: pts.map(([i]) => [i, b!.median]) }, { name: 'Top of normal', points: pts.map(([i]) => [i, b!.high]) }]} />
          <div className="faint">{over ? `${over} of the last ${pts.length} turns went over the band; each one was pointed out in its panel.` : 'Every recent turn is inside the band.'} Median and spread of this project on this model, last 200 turns.</div>
        </>
      )}
    </section>
  )
}

/** Phase 88: an endpoint the person runs (a local gateway); off unless turned on, never picked on its own. */
function CustomEndpoint() {
  const [on, setOn] = useState(false)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.billSource.get('').then((s) => (setOn(s.customOn), setUrl(s.customUrl)), () => {}), [])
  const save = (o: boolean) => void window.stm.billSource.custom(o, url).then(() => (setOn(o), setErr('')), (e) => setErr(String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
  return (
    <section className="bg-section">
      <div className="sp-label">Custom endpoint</div>
      <div className="faint">For a gateway you run yourself. Prompts, replies and keys pass through it. Off by default; a panel uses it only when you pick it there and confirm twice.</div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:20128" spellCheck={false} aria-label="Custom endpoint address" />
      <label className="ca-toggle"><input type="checkbox" checked={on} onChange={(e) => save(e.target.checked)} />Allow panels to pick this endpoint</label>
      {err && <div className="bg-err">{err}</div>}
    </section>
  )
}

function Row(props: { name: string; usd: number; limit?: number; money: (usd: number) => string; note?: string }) {
  const share = props.limit ? Math.min(1, props.usd / props.limit) : 0
  return (
    <div className={`bg-row ${share >= 1 ? 'over' : share >= 0.8 ? 'near' : ''}`}>
      <span className="bg-row-name" title={props.name}>{props.name}</span>
      <span className="bg-row-usd">{props.money(props.usd)}{props.limit ? <span className="faint"> / {props.money(props.limit)}</span> : null}</span>
      {props.limit ? <span className="bg-bar" aria-hidden><i style={{ width: `${share * 100}%` }} /></span> : null}
      {props.note && <span className="faint bg-row-note">{props.note}</span>}
    </div>
  )
}
