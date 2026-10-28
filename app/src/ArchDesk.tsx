import { useEffect, useState } from 'react'
import { PATTERNS, patternsFor, type Card } from '../shared/patterns'
import { capacity, CHECKLIST, exerciseOf, isoWeek, reviewPrompt, type Adr, type AdrStatus, type CapacityIn } from '../shared/archdesk'
import { Stat } from './Chart'
import { clean } from './errors'
import { IconAdd, IconCheck, IconClose, IconExternal, IconSend } from './icons'
import './bridge'
import { NumberField, Select } from './ui'

const STATUS: AdrStatus[] = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']
const VERB: Record<AdrStatus, string> = { proposed: 'Back to proposed', accepted: 'Accept', rejected: 'Reject', deprecated: 'Deprecate', superseded: 'Supersede' }
const n2 = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1))

/**
 * The architecture desk: the project's decision records (docs/adr), a design review a panel runs with a
 * checklist that credits its sources, a back-of-the-envelope capacity estimate, and this week's exercise.
 */
export function ArchDeskSheet(props: { cwd?: string; onClose: () => void; onSend: (text: string) => void; onExercise: (text: string) => void }) {
  const cwd = props.cwd ?? ''
  const [tab, setTab] = useState<'adr' | 'review' | 'patterns' | 'capacity' | 'exercise'>('adr')
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ar" role="dialog" aria-label="Architecture desk">
        <header className="sheet-head">
          <div className="sheet-title">Architecture desk</div>
          <div className="segmented small" role="tablist">
            {([['adr', 'Decisions'], ['review', 'Review'], ['patterns', 'Patterns'], ['capacity', 'Capacity'], ['exercise', 'Exercise']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {tab === 'patterns' ? <Patterns />
          : !cwd && tab !== 'capacity' && tab !== 'exercise' ? <div className="dsg-body"><div className="faint">Focus a panel on a project first.</div></div>
          : tab === 'adr' ? <Decisions cwd={cwd} />
          : tab === 'review' ? <Review cwd={cwd} onSend={props.onSend} />
          : tab === 'capacity' ? <Capacity />
          : <Exercise onStart={props.onExercise} />}
      </div>
    </div>
  )
}

function Decisions(props: { cwd: string }) {
  const [list, setList] = useState<Adr[] | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [fresh, setFresh] = useState<{ title: string; context: string; supersedes: number } | null>(null)
  const [err, setErr] = useState('')
  const load = (focus?: string) => void window.stm.adr.list(props.cwd).then((r) => (setList(r.adrs), setPick((p) => focus ?? p ?? r.adrs[r.adrs.length - 1]?.file ?? null)), (e) => setErr(clean(e)))
  useEffect(() => load(), [props.cwd])
  useEffect(() => {
    if (pick) void window.stm.adr.read(props.cwd, pick).then((t) => (setText(t), setDirty(false)))
  }, [pick])
  const cur = list?.find((a) => a.file === pick)
  const act = (p: Promise<Adr[]>) => void p.then(setList, (e) => setErr(clean(e)))
  return (
    <div className="ar-body">
      <div className="ar-list">
        <button className="small" onClick={() => setFresh({ title: '', context: '', supersedes: 0 })}><IconAdd />New decision</button>
        {list && !list.length && <div className="faint">No decisions recorded yet. They live in docs/adr as plain markdown, next to the code.</div>}
        {list?.slice().reverse().map((a) => (
          <button key={a.file} className={`ar-item ${a.file === pick ? 'on' : ''}`} onClick={() => (setFresh(null), setPick(a.file))}>
            <span className="ar-n">{String(a.n).padStart(4, '0')}</span>
            <span className="ar-title">{a.title}</span>
            <span className={`ar-status ${a.status}`}>{a.status}{a.supersededBy ? ` by ${a.supersededBy}` : ''}</span>
          </button>
        ))}
      </div>
      <div className="ar-edit">
        {err && <div className="notice error">{err}</div>}
        {fresh ? (
          <>
            <div className="fld-grid">
              <label className="fld wide"><span className="fld-label">Decision</span><input autoFocus value={fresh.title} placeholder="Use a queue for outgoing email" onChange={(e) => setFresh({ ...fresh, title: e.target.value })} /></label>
              <label className="fld wide"><span className="fld-label">Context</span><textarea rows={4} value={fresh.context} placeholder="What forces this decision now?" onChange={(e) => setFresh({ ...fresh, context: e.target.value })} /></label>
              <label className="fld"><span className="fld-label">Replaces</span><Select value={fresh.supersedes} onChange={(e) => setFresh({ ...fresh, supersedes: Number(e.target.value) })}><option value={0}>Nothing</option>{list?.filter((a) => a.status !== 'superseded').map((a) => <option key={a.n} value={a.n}>{a.n}. {a.title}</option>)}</Select></label>
            </div>
            <div className="ob-row"><span className="spacer-flex" /><button className="ghost small" onClick={() => setFresh(null)}>Cancel</button><button className="primary small" disabled={!fresh.title.trim()} onClick={() => void window.stm.adr.create(props.cwd, fresh.title, fresh.context, fresh.supersedes || undefined).then((r) => (setList(r.adrs), setFresh(null), setPick(r.file)), (e) => setErr(clean(e)))}><IconCheck />Write docs/adr/…</button></div>
          </>
        ) : cur ? (
          <>
            <div className="ob-row">
              <b>{cur.n}. {cur.title}</b>
              <span className="faint">{cur.file}{cur.date ? ` · ${cur.date}` : ''}</span>
              <span className="spacer-flex" />
              {STATUS.filter((s) => s !== cur.status && s !== 'superseded').map((s) => <button key={s} className="ghost small" onClick={() => act(window.stm.adr.status(props.cwd, cur.file, s))}>{VERB[s]}</button>)}
            </div>
            <textarea className="ar-text" value={text} spellCheck={false} onChange={(e) => (setText(e.target.value), setDirty(true))} aria-label="ADR text" />
            {patternsFor(`${cur.title}\n${text}`).length > 0 && (
              <div className="pat-related">
                <div className="sp-label">Patterns this decision touches</div>
                <div className="pat-grid">{patternsFor(`${cur.title}\n${text}`).map((c) => <PatternCard key={c.id} c={c} />)}</div>
              </div>
            )}
            <div className="ob-row"><span className="faint">Plain markdown in the repository: commit it with the code it explains.</span><span className="spacer-flex" /><button className="primary small" disabled={!dirty} onClick={() => act(window.stm.adr.save(props.cwd, cur.file, text).then((r) => (setDirty(false), r)))}>Save</button></div>
          </>
        ) : <div className="faint">Pick a decision, or write a new one.</div>}
      </div>
    </div>
  )
}

function Review(props: { cwd: string; onSend: (t: string) => void }) {
  const [extra, setExtra] = useState('')
  const project = props.cwd.split('/').filter(Boolean).pop() ?? 'this project'
  return (
    <div className="ar-pad">
      <div className="faint">The focused panel reviews the project against this checklist, answering each item with files, the risk and one change. It does not edit anything. Items are in our words; each names where the idea comes from.</div>
      <ol className="ar-check">
        {CHECKLIST.map((c) => (
          <li key={c.area}><b>{c.area}</b><span>{c.ask}</span><a className="faint" href={c.link} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(c.link))}><IconExternal />{c.source}</a></li>
        ))}
      </ol>
      <div className="ob-row">
        <input className="ob-grow" value={extra} placeholder="Anything to weigh in particular (PCI scope, a deadline, a budget)" onChange={(e) => setExtra(e.target.value)} />
        <button className="primary small" onClick={() => props.onSend(reviewPrompt(project, extra))}><IconSend />Send the review to the panel</button>
      </div>
      <div className="faint ar-credit">Checklist sources: System Design Primer by Donne Martin (CC BY 4.0), Google SRE book, Michael Nygard on ADRs. Linked, not copied.</div>
    </div>
  )
}

function Capacity() {
  const [c, setC] = useState<CapacityIn>({ dau: 100_000, requestsPerUser: 40, peak: 3, readRatio: 0.9, payloadKb: 20, writeKb: 2, years: 3, replicas: 3 })
  const r = capacity(c)
  const f = (k: keyof CapacityIn, label: string, help: string, step = 1) => (
    <label className="fld"><span className="fld-label">{label}</span><NumberField step={step} min={0} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) || 0 })} /><span className="fld-help">{help}</span></label>
  )
  return (
    <div className="ar-pad">
      <div className="fld-grid">
        {f('dau', 'Daily active users', 'people a day')}
        {f('requestsPerUser', 'Requests per user', 'a day')}
        {f('peak', 'Peak factor', 'peak over average', 0.5)}
        {f('readRatio', 'Read share', '0.9 = 90% reads', 0.05)}
        {f('payloadKb', 'Response size', 'KB on average')}
        {f('writeKb', 'Stored per write', 'KB kept')}
        {f('years', 'Keep for', 'years')}
        {f('replicas', 'Copies', 'replicas incl. primary')}
      </div>
      <div className="ar-stats">
        <Stat label="Requests, average" value={Number(n2(r.qpsAvg).replace(/,/g, ''))} unit="/s" />
        <Stat label="Requests, peak" value={Number(n2(r.qpsPeak).replace(/,/g, ''))} unit="/s" />
        <Stat label="Writes, peak" value={Number(n2(r.writeQps).replace(/,/g, ''))} unit="/s" />
        <Stat label="Egress, peak" value={Number(n2(r.egressMbps).replace(/,/g, ''))} unit="Mbps" />
        <Stat label="Storage a year" value={Number(n2(r.storagePerYearGb).replace(/,/g, ''))} unit="GB" />
        <Stat label="Storage, all copies" value={Number(n2(r.storageTotalGb).replace(/,/g, ''))} unit="GB" />
      </div>
      <div className="faint">Back of the envelope: averages over a day, a single peak factor, no compression or indexes. Good for orders of magnitude, not for a bill.</div>
    </div>
  )
}

function Exercise(props: { onStart: (t: string) => void }) {
  const now = new Date()
  const ex = exerciseOf(now)
  return (
    <div className="ar-pad">
      <span className="fld-label">Week {isoWeek(now)}</span>
      <div className="ar-ex">{ex}</div>
      <div className="faint">Work it out with a panel: requirements and numbers first, then the design, then what you would record as decisions. A new exercise every Monday.</div>
      <div className="ob-row"><span className="spacer-flex" /><button className="primary small" onClick={() => props.onStart(`Let's practice system design. This week's exercise: ${ex}\n\nAsk me for the requirements and numbers first; do not give the full answer at once. Push back on weak choices, and at the end list the decisions worth an ADR.`)}><IconSend />Start in a new panel</button></div>
    </div>
  )
}

/** Phase 114: one pattern, in our words, with where to read further. */
function PatternCard(props: { c: Card }) {
  const c = props.c
  return (
    <div className="pat-card">
      <div className="pat-head"><b>{c.name}</b><span className="pt-kind">{c.area}</span></div>
      <div><span className="pat-k">When</span>{c.when}</div>
      <div><span className="pat-k">Costs</span>{c.cost}</div>
      <div><span className="pat-k">Trap</span>{c.trap}</div>
      <div className="pat-read">{c.read.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer">{r.name}</a>)}</div>
    </div>
  )
}
function Patterns() {
  const areas = [...new Set(PATTERNS.map((c) => c.area))]
  return (
    <div className="dsg-body pat-body">
      <div className="faint">Patterns in our words, grouped by the review checklist's areas. Writing a decision shows the ones it touches; the links go further.</div>
      {areas.map((a) => (
        <section key={a}>
          <div className="sp-label">{a}</div>
          <div className="pat-grid">{PATTERNS.filter((c) => c.area === a).map((c) => <PatternCard key={c.id} c={c} />)}</div>
        </section>
      ))}
    </div>
  )
}
