import { paramsOf, READ_MIN_PARAMS } from '../shared/params'
import { IconClose } from './icons'
import { useEffect, useState } from 'react'
import { ratesLabel, updateRates, useRates } from './rates'
import { totalIn, type Fixed, type Source } from '../electron/billing'

const COLORS = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--gold)', 'var(--red)', 'var(--accent-glow)', 'var(--muted)']
const fmt = (n: number, c: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)
const days = (d: string) => Math.round((Date.parse(d) - Date.now()) / 86_400_000)

/** What the products cost this month: one number, one bar, the renewals on a line, the sources as cards. */
export function Spend(props: { onClose: () => void; onConnections: () => void }) {
  const [sources, setSources] = useState<Source[] | null>(null)
  const [fixed, setFixed] = useState<Fixed[]>([])
  const r = useRates()
  const rates = { BRL: 1, USD: r.USD, EUR: r.EUR }
  const [rateNote, setRateNote] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ name: string; amount: string; currency: string; day: string } | null>(null)

  const load = async () => {
    setSources(await window.stm.billing.all())
    setFixed(await window.stm.billing.fixed())
  }
  useEffect(() => {
    void load()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const priced = (sources ?? []).filter((s) => s.month && s.month.amount > 0)
  const total = totalIn(priced, 'BRL', rates)
  const inBrl = (s: Source) => totalIn([s], 'BRL', rates)
  const renewals = (sources ?? []).flatMap((s) => (s.renewals ?? []).map((r) => ({ ...r, color: COLORS[priced.indexOf(s) % COLORS.length] ?? 'var(--muted)' }))).filter((r) => days(r.date) >= -1 && days(r.date) <= 90).sort((a, b) => a.date.localeCompare(b.date))
  const missing = (sources ?? []).filter((s) => s.missing)

  const saveFixed = async (next: Fixed[]) => {
    setFixed(await window.stm.billing.setFixed(next))
    setSources(await window.stm.billing.all())
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet spend" role="dialog" aria-label="Spend">
        <header className="sheet-head">
          <div className="sheet-title">Spend</div>
          <span className="spacer-flex" />
          <span className="faint" title="The day's rates come from frankfurter.dev, only when you ask">{rateNote ?? ratesLabel(r)}</span>
          <button className="ghost small" onClick={() => { setRateNote(null); updateRates().catch(() => setRateNote('Rates not updated, offline?')) }}>Update rates</button>
          <button className="ghost small" onClick={() => { setSources(null); void load() }}>Refresh</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body sp">
          <SmallTasks />
          <div className="sp-hero">
            <div>
              <div className="sp-label">This month</div>
              <div className="sp-total">{sources ? fmt(total, 'BRL') : '...'}</div>
            </div>
            <div className="sp-bar" aria-label="Share of each source">
              {priced.map((s, i) => (
                <span key={s.id} style={{ flexGrow: inBrl(s), background: COLORS[i % COLORS.length] }} title={`${s.name}: ${fmt(inBrl(s), 'BRL')}`} />
              ))}
            </div>
            <div className="sp-legend">
              {priced.map((s, i) => (
                <span key={s.id}><i style={{ background: COLORS[i % COLORS.length] }} />{s.name} <b>{fmt(s.month!.amount, s.month!.currency)}</b></span>
              ))}
            </div>
          </div>

          {renewals.length > 0 && (
            <div className="sp-line">
              <div className="sp-label">Next 90 days</div>
              <svg viewBox="0 0 900 70" className="sp-time" preserveAspectRatio="none">
                <line x1="0" y1="34" x2="900" y2="34" className="axis" />
                {[0, 30, 60, 90].map((d) => (
                  <g key={d}><line x1={d * 10} y1="28" x2={d * 10} y2="40" className="axis" /><text x={Math.min(880, d * 10 + 2)} y="56">{d === 0 ? 'today' : `${d}d`}</text></g>
                ))}
                {renewals.map((r, i) => (
                  <g key={i}>
                    <circle cx={Math.max(6, days(r.date) * 10)} cy="34" r={r.amount ? 7 : 5} fill={r.color} />
                    <title>{`${r.name}: ${new Date(r.date).toLocaleDateString(undefined)}${r.amount ? `, ${fmt(r.amount.amount, r.amount.currency)}` : ''}`}</title>
                  </g>
                ))}
              </svg>
              <div className="sp-next">
                {renewals.slice(0, 4).map((r, i) => (
                  <span key={i}><i style={{ background: r.color }} />{r.name} <b>{days(r.date) <= 0 ? 'today' : `in ${days(r.date)}d`}</b></span>
                ))}
              </div>
            </div>
          )}

          <div className="sp-cards">
            {(sources ?? []).filter((s) => !s.missing).map((s) => (
              <button key={s.id} className={`sp-card ${s.error ? 'bad' : ''}`} onClick={() => s.url && void window.stm.openUrl(s.url)} title={s.error ?? s.url}>
                <span className="sp-card-head">
                  <span className={`sp-src ${s.kind}`} title={s.kind === 'api' ? 'Read from the account' : 'Typed in by you'} />
                  <b>{s.name}</b>
                </span>
                {s.month && <span className="sp-amount">{fmt(s.month.amount, s.month.currency)}<span className="faint"> /mo</span></span>}
                {s.balance && <span className="sp-amount">{fmt(s.balance.amount, s.balance.currency)}<span className="faint"> left</span></span>}
                {s.usage?.map((u) => <span key={u.label} className="sp-usage"><b>{u.value}</b> {u.label}</span>)}
                {s.error && <span className="sp-err">{s.error}</span>}
                {s.kind === 'manual' && (
                  <span className="sp-remove" role="button" title="Remove" onClick={(e) => { e.stopPropagation(); void saveFixed(fixed.filter((f) => f.id !== s.id)) }}>×</span>
                )}
              </button>
            ))}
            {adding ? (
              <form className="sp-card sp-add-form" onSubmit={(e) => {
                e.preventDefault()
                void saveFixed([...fixed, { id: `f-${Date.now()}`, name: adding.name.trim(), amount: Number(adding.amount.replace(',', '.')), currency: adding.currency, day: Number(adding.day) || 1 }])
                setAdding(null)
              }}>
                <input autoFocus placeholder="Claude Max, Vercel, domain..." value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
                <span className="sp-add-row">
                  <input placeholder="100" inputMode="decimal" value={adding.amount} onChange={(e) => setAdding({ ...adding, amount: e.target.value })} />
                  <select value={adding.currency} onChange={(e) => setAdding({ ...adding, currency: e.target.value })}>
                    <option>USD</option><option>BRL</option><option>EUR</option>
                  </select>
                  <input placeholder="day" inputMode="numeric" value={adding.day} onChange={(e) => setAdding({ ...adding, day: e.target.value })} title="Day of the month it charges" />
                </span>
                <span className="sp-add-row"><button className="small" disabled={!adding.name.trim() || !adding.amount}>Add</button><button type="button" className="ghost small" onClick={() => setAdding(null)}>Cancel</button></span>
              </form>
            ) : (
              <button className="sp-card sp-add" onClick={() => setAdding({ name: '', amount: '', currency: 'USD', day: '' })}>
                <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 4v14M4 11h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                Fixed cost
              </button>
            )}
          </div>

          {missing.length > 0 && (
            <div className="sp-missing">
              <span className="faint">Add a key in Connections to read:</span>
              {missing.map((s) => <button key={s.id} className="chip" title={s.missing} onClick={props.onConnections}>{s.name}</button>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`
/** "751.63M" or "4B" as a number of parameters. */

/**
 * Where small tasks run: a commit message, a reply suggestion, the router's tie-break, a post
 * draft. A local model through Ollama keeps them free and off the Claude plan.
 */
const unloadIn = (iso: string) => {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  return s <= 0 ? 'now' : s < 90 ? `in ${s}s` : `in ${Math.round(s / 60)} min`
}

function SmallTasks() {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.small.get>> | null>(null)
  useEffect(() => {
    void window.stm.small.get().then(setSt)
    const t = setInterval(() => void window.stm.small.get().then(setSt), 5000)
    return () => clearInterval(t)
  }, [])
  if (!st) return null
  const pick = async (m: string | null) => setSt({ ...st, model: await window.stm.small.set(m) })
  const s = st.stats
  return (
    <div className="sp-small">
      <div className="sp-small-head">
        <div>
          <div className="sp-label">Small tasks</div>
          <div className="sp-small-what">Commit messages, reply suggestions, the router’s pick, post drafts. With a local model, panels also hand it chores: reading a long log for one answer, short drafts.</div>
        </div>
        <span className="spacer-flex" />
        {st.models === null ? (
          <button className="ghost small" onClick={() => void window.stm.openUrl('https://ollama.com/download')}>Get Ollama, free</button>
        ) : (
          <select value={st.model ?? ''} onChange={(e) => void pick(e.target.value || null)}>
            <option value="">Claude Haiku (your plan)</option>
            {st.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} · on this Mac{m.params ? ` · ${m.params}` : ''} · {gb(m.size)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="sp-small-note faint">
        {st.models === null
          ? 'Ollama runs open models on this Mac. Install it, then pull a small model (ollama pull qwen3:4b-instruct) and pick it here.'
          : st.models.length === 0
            ? 'Ollama is running but has no models yet: ollama pull qwen3:4b-instruct'
            : st.model
              ? st.jobs.filter((j) => j.kind === 'draft' && j.ok).slice(0, 3).some((j) => j.kept > 250)
                ? 'Its answers come back long: this model reasons aloud before it answers, so chores are slow. An instruct model is the fit: ollama pull qwen3:4b-instruct'
                : (paramsOf(st.models.find((m) => m.name === st.model)?.params) ?? 1e10) < READ_MIN_PARAMS
                ? 'Runs on this Mac, free, but a model this small guesses badly, so panels do not give it files to read. qwen3:4b-instruct or larger does much better.'
                : 'Runs on this Mac, free. If it fails, Claude takes the task.'
              : 'Pick a local model to run these free and off your Claude plan.'}
      </div>
      {st.model && st.loaded && (
        <div className="sp-small-live">
          <span className={`sp-dot${st.loaded.length ? ' on' : ''}`} />
          {st.loaded.length
            ? st.loaded.map((l) => `${l.name} in memory, ${gb(l.bytes)}, unloads ${unloadIn(l.until)}`).join(' · ')
            : 'Nothing in memory: the model loads for a task and unloads 2 minutes after.'}
        </div>
      )}
      {st.jobs.length > 0 && (
        <ul className="sp-jobs">
          {st.jobs.slice(0, 6).map((j) => (
            <li key={j.at} className={j.ok ? '' : 'failed'}>
              <span className="sp-job-kind">{j.kind === 'read' ? 'Read' : 'Draft'}</span>
              <span className="sp-job-what">{j.what}</span>
              <span className="faint">{j.ok ? (j.kind === 'read' ? `${Math.round(j.read).toLocaleString()} tokens kept out` : 'done') : 'failed, Claude did it'}</span>
              <span className="faint num">{(j.ms / 1000).toFixed(1)}s</span>
            </li>
          ))}
        </ul>
      )}
      {(s.local > 0 || s.claude > 0) && (
        <div className="sp-small-stats">
          <div><strong>{s.local}</strong><span>on this Mac</span></div>
          <div><strong>{s.localTokens.toLocaleString()}</strong><span>tokens kept off your plan</span></div>
          <div><strong>{s.claude}</strong><span>on Claude</span></div>
        </div>
      )}
    </div>
  )
}
