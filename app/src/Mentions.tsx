import { lazy, Suspense, useEffect, useState } from 'react'
import { IconClose } from './icons'
import { NumberField, Switch } from './ui'
import { DEFAULTS, NET_NAME, type Config, type Item } from '../shared/mentions'
import { count } from '../shared/social'
import type { TriageLabel } from '../shared/socialprompts'
import { Accounts } from './Accounts'

const Evergreen = lazy(() => import('./Evergreen').then((m) => ({ default: m.Evergreen })))

type State = Awaited<ReturnType<typeof window.stm.mentions.get>>

// list order for the labels; spam is folded away below the list
const ORDER: TriageLabel[] = ['needs-you', 'question', 'bug', 'praise']
const NAME: Record<TriageLabel, string> = { 'needs-you': 'Needs you', question: 'Question', bug: 'Bug report', praise: 'Praise', spam: 'Spam or noise' }

// labels from this session, so reopening the sheet does not ask Claude again about the same mentions
const labelSeen: Partial<Record<string, TriageLabel>> = {}
const skipSeen: Partial<Record<string, string>> = {}

/**
 * Mentions: when someone mentions you asking for a summary, the app briefs the post their mention replies
 * to and drafts a reply. Nothing is posted until you click Approve. Works while the app is open.
 */
export function MentionsSheet(props: { onClose: () => void }) {
  const [s, setS] = useState<State | null>(null)
  const [cfg, setCfg] = useState<Config>(DEFAULTS)
  const [err, setErr] = useState('')
  const [setup, setSetup] = useState(false)
  const [triageOn, setTriageOn] = useState(false)
  const [labels, setLabels] = useState<Partial<Record<string, TriageLabel>>>(labelSeen)
  const [skipped, setSkipped] = useState<Partial<Record<string, string>>>(skipSeen)
  const [filter, setFilter] = useState<TriageLabel | 'all'>('all')
  const [triageErr, setTriageErr] = useState('')
  const load = () => void window.stm.mentions.get().then((r) => (setS(r), setCfg(r.cfg)), (e: Error) => setErr(e.message))
  useEffect(() => (load(), window.stm.mentions.onChange(load)), [])
  useEffect(() => void window.stm.social.triageOn().then(setTriageOn, () => undefined), [])
  const run = (p: Promise<unknown>) => void p.then(() => (setErr(''), load()), (e: Error) => setErr(e.message))
  const save = (c: Config) => (setCfg(c), run(window.stm.mentions.save(c)))
  const toggleTriage = (on: boolean) => void window.stm.social.setTriageOn(on).then((v) => (setTriageOn(v), setTriageErr('')), (e: Error) => setTriageErr(e.message))
  const waiting = s?.queue.filter((q) => q.state === 'ready' || q.state === 'briefing') ?? []
  const done = s?.queue.filter((q) => !waiting.includes(q)) ?? []

  // only mentions nobody has labeled yet go to Claude; the labels never send anything
  const unlabeled = triageOn ? waiting.filter((q) => !labels[q.key] && !skipped[q.key]) : []
  const unlabeledKey = unlabeled.map((q) => q.key).join('|')
  useEffect(() => {
    if (!unlabeled.length) return
    let live = true
    void window.stm.social.triage(unlabeled.map((q) => ({ id: q.key, author: q.author, text: q.text }))).then((r) => {
      if (!live) return
      if (!r.on) { setTriageOn(false); return }
      Object.assign(labelSeen, r.labels)
      Object.assign(skipSeen, r.skipped)
      setLabels((x) => ({ ...x, ...r.labels }))
      setSkipped((x) => ({ ...x, ...r.skipped }))
    }, (e: Error) => { if (live) setTriageErr(e.message) })
    return () => { live = false }
  }, [unlabeledKey])

  const folded = waiting.filter((q) => skipped[q.key] || labels[q.key] === 'spam')
  const open = waiting.filter((q) => !folded.includes(q))
  const rank = (q: Item) => { const l = labels[q.key]; return l && l !== 'spam' ? ORDER.indexOf(l) : ORDER.length }
  const shown = open.filter((q) => filter === 'all' || labels[q.key] === filter).sort((a, b) => rank(a) - rank(b) || a.at - b.at)
  const countOf = (id: TriageLabel) => open.filter((q) => labels[q.key] === id).length

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config" role="dialog" aria-label="Mentions">
        <header className="sheet-head">
          <div className="sheet-title">Mentions</div>
          <span className="faint">draft replies to people who ask you for a brief</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ob-row">
          <Switch checked={cfg.on} aria-label="Watch mentions" onChange={(e) => save({ ...cfg, on: e.target.checked })} />
          <span>Watch my mentions while the app is open</span>
          <span className="spacer-flex" />
          <button className="ghost small" onClick={() => setSetup(!setup)}>{setup ? 'Hide accounts' : 'Accounts'}</button>
          <button className="ghost small" disabled={!cfg.on} onClick={() => run(window.stm.mentions.check())}>Check now</button>
        </div>
        <div className="ob-row">
          <Switch checked={triageOn} aria-label="Label mentions with Claude" onChange={(e) => toggleTriage(e.target.checked)} />
          <span>Label mentions with Claude</span>
        </div>
        <div className="faint">
          Labels only sort and filter the list. They never send a reply; Approve is still the only way to post.
          {!triageOn && ' Off by default: nothing is sent to Claude until you turn it on.'}
        </div>
        <div className="faint">
          A mention that asks for a summary or a prompt gets a draft reply here. Nothing is posted until you approve it.
          {s && ` ${s.sentLastHour} of ${cfg.maxPerHour} replies sent this hour.`}
          {s?.last.at ? ` Last check ${new Date(s.last.at).toLocaleTimeString()}.` : ''}
        </div>
        {s?.last.error && <div className="mi-warn">Last check failed: {s.last.error}. Retrying later, less often.</div>}
        {err && <div className="mi-warn">{err}</div>}
        {triageErr && <div className="mi-warn">Labels: {triageErr}</div>}
        {setup && s && <Setup cfg={cfg} save={save} onAccounts={load} />}
        {triageOn && open.length > 0 && (
          <div className="ob-row" role="group" aria-label="Filter by label">
            <button className={filter === 'all' ? 'primary small' : 'ghost small'} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {open.length}</button>
            {ORDER.map((id) => (
              <button key={id} className={filter === id ? 'primary small' : 'ghost small'} aria-pressed={filter === id} onClick={() => setFilter(id)}>{NAME[id]} {countOf(id)}</button>
            ))}
          </div>
        )}
        {cfg.on && !waiting.length && <div className="faint">No mentions waiting.</div>}
        {shown.map((q) => (
          <Row key={q.key} q={q} max={s?.limits[q.net] ?? 280} run={run} label={labels[q.key]} labeling={triageOn && !labels[q.key] && !skipped[q.key]} />
        ))}
        {folded.length > 0 && (
          <details>
            <summary className="faint">{NAME.spam} ({folded.length})</summary>
            {folded.map((q) => (
              <div key={q.key} className="faint">
                {NET_NAME[q.net]} · {q.author} · {skipped[q.key] ? `skipped before Claude: ${skipped[q.key]}` : NAME.spam}
              </div>
            ))}
          </details>
        )}
        {done.length > 0 && (
          <details>
            <summary className="faint">Done ({done.length})</summary>
            {done.map((q) => (
              <div key={q.key} className="faint">{NET_NAME[q.net]} · {q.author} · {q.state}{q.error ? `: ${q.error}` : ''}</div>
            ))}
            <button className="ghost small" onClick={() => run(window.stm.mentions.clear())}>Clear done</button>
          </details>
        )}
        <Suspense fallback={null}><Evergreen /></Suspense>
      </div>
    </div>
  )
}

function Row(props: { q: Item; max: number; run: (p: Promise<unknown>) => void; label?: TriageLabel; labeling?: boolean }) {
  const { q } = props
  const [parts, setParts] = useState(q.draft)
  const [busy, setBusy] = useState(false)
  useEffect(() => setParts(q.draft), [q.draft])
  const max = props.max
  const over = parts.some((p) => count(q.net, p) > max)
  return (
    <section>
      <div className="chart-name">
        {NET_NAME[q.net]} · {q.author} <a href={q.url} target="_blank" rel="noreferrer">mention</a>
        {' '}{props.label && <span className="dc-tag">{NAME[props.label]}</span>}
        {props.labeling && <span className="faint"> labeling...</span>}
      </div>
      <div className="faint" style={{ whiteSpace: 'pre-wrap' }}>{q.text}</div>
      <div className="faint">Post by {q.post.author} <a href={q.post.url} target="_blank" rel="noreferrer">open</a></div>
      <p style={{ whiteSpace: 'pre-wrap' }}>{q.post.text.slice(0, 600)}</p>
      {q.state === 'briefing' ? <div className="faint">Briefing the post...</div> : (
        <>
          {parts.map((p, i) => (
            <div key={i}>
              <textarea value={p} rows={4} aria-label={`Reply part ${i + 1}`} onChange={(e) => setParts(parts.map((x, j) => (j === i ? e.target.value : x)))} />
              <div className={count(q.net, p) > max ? 'mi-warn' : 'faint'}>{count(q.net, p)} / {max}</div>
            </div>
          ))}
          <div className="ob-row">
            <span className="spacer-flex" />
            <button className="ghost small" onClick={() => props.run(window.stm.mentions.skip(q.key))}>Skip</button>
            <button
              className="primary"
              disabled={busy || over || !parts.some((p) => p.trim())}
              onClick={() => (setBusy(true), props.run(window.stm.mentions.approve(q.key, parts).finally(() => setBusy(false))))}
            >
              {parts.length > 1 ? `Approve and post ${parts.length}` : 'Approve and post'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function Setup(props: { cfg: Config; save: (c: Config) => void; onAccounts: () => void }) {
  const { cfg, save } = props
  const [c, setC] = useState(cfg)
  return (
    <section>
      <Accounts only={['bluesky', 'mastodon', 'x']} note="Mentions on X need the numeric user id and X API access that reads mentions (a paid tier on X)." onChange={props.onAccounts} />
      <div className="chart-name">Rules</div>
      <label className="fld"><span className="fld-label">Words that ask for a brief (comma separated; empty uses English, Portuguese and Spanish defaults)</span>
        <input value={c.keywords} placeholder="summarize, tl;dr, resumo, resumen, prompt" onChange={(e) => setC({ ...c, keywords: e.target.value })} />
      </label>
      <div className="ob-row">
        <label className="fld"><span className="fld-label">Check every (minutes)</span><NumberField min={1} max={60} value={c.everyMin} onChange={(e) => setC({ ...c, everyMin: Number(e.target.value) })} /></label>
        <label className="fld"><span className="fld-label">Most replies an hour</span><NumberField min={1} max={60} value={c.maxPerHour} onChange={(e) => setC({ ...c, maxPerHour: Number(e.target.value) })} /></label>
        <span className="spacer-flex" />
        <button className="primary" onClick={() => save({ ...c, on: cfg.on })}>Save</button>
      </div>
      <div className="faint">Mentions and posts are read as data, never as instructions.</div>
    </section>
  )
}
