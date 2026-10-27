import { Fragment, useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { ResearchEvent } from '../electron/research'
import type { Source, SourceKind } from '../shared/research'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { LastDays } from './LastDays'
import './bridge'

const KINDS: { id: SourceKind; label: string; note: string }[] = [
  { id: 'web', label: 'Web', note: 'your SearXNG and the web reader' },
  { id: 'hn', label: 'Hacker News', note: 'its official search API' },
  { id: 'github', label: 'GitHub', note: 'public repositories' },
  { id: 'folder', label: 'This project', note: 'text files in the panel folder' },
]
const TAG: Record<SourceKind, string> = { web: 'Web', hn: 'HN', github: 'GitHub', folder: 'File' }
type Done = Extract<ResearchEvent, { stage: 'done' }>
type Reads = Record<number, Partial<Record<SourceKind, { found: number; error?: string }>>>

/** The report as blocks: each heading alone, paragraphs split at blank lines. */
const blocks = (md: string) =>
  md.split('\n').reduce<string[]>((out, line) => {
    if (/^#{1,3} /.test(line)) out.push(line, '')
    else if (!line.trim()) out.push('')
    else out[out.length - 1] = out.length ? `${out[out.length - 1]}${out[out.length - 1] ? ' ' : ''}${line}` : line
    if (!out.length) out.push(line)
    return out
  }, ['']).filter((b) => b.trim())

/** A report line with its [n] citations as chips that point at the numbered source. */
function Cited(props: { text: string; sources: Source[]; uncited: Set<string> }) {
  const parts = props.text.split(/(\[\d+\])/g)
  return (
    <>
      {parts.map((p, i) => {
        const n = /^\[(\d+)\]$/.exec(p)?.[1]
        if (!n) return <Fragment key={i}>{p}</Fragment>
        const s = props.sources[Number(n) - 1]
        return s ? <a key={i} className="rs-cite" href={s.url} target="_blank" rel="noreferrer" title={s.title}>{n}</a> : <span key={i} className="rs-cite bad" title="No such source">{n}</span>
      })}
    </>
  )
}

/**
 * Research: a topic becomes questions, each read across the chosen sources in parallel, and a report
 * where each claim cites its source. Uncited sentences are flagged; the report can go to a panel or
 * into the project's research folder.
 */
export function ResearchSheet(props: { cwd?: string; onClose: () => void; onSend: (text: string) => void; onDraft?: (title: string, brief: string) => void }) {
  const [tab, setTab] = useState<'report' | 'last' | 'extract'>('report')
  const [topic, setTopic] = useState('')
  const [kinds, setKinds] = useState<SourceKind[]>(['web', 'hn', 'github'])
  const [breadth, setBreadth] = useState(3)
  const [depth, setDepth] = useState(4)
  const [busy, setBusy] = useState(false)
  const [questions, setQuestions] = useState<string[]>([])
  const [reads, setReads] = useState<Reads>({})
  const [sources, setSources] = useState<Source[]>([])
  const [stage, setStage] = useState('')
  const [done, setDone] = useState<Done | null>(null)
  const [stopped, setStopped] = useState('')
  const [saved, setSaved] = useState('')
  useEffect(
    () =>
      window.stm.research.onEvent((e) => {
        if (e.stage === 'plan') (setQuestions(e.questions), setStage('Reading the sources'))
        else if (e.stage === 'read') setReads((r) => ({ ...r, [e.question]: { ...r[e.question], [e.kind]: { found: e.found, error: e.error } } }))
        else if (e.stage === 'sources') (setSources(e.sources), setStage(`Keeping ${e.sources.length} sources`))
        else if (e.stage === 'publish') setStage(`Writing the report (about ${e.tokens.toLocaleString('en-US')} tokens in)`)
        else if (e.stage === 'done') (setDone(e), setStage(''))
        else if (e.stage === 'stopped') (setStopped(e.why), setStage(''))
      }),
    [],
  )
  const run = async () => {
    setBusy(true)
    setQuestions([])
    setReads({})
    setSources([])
    setDone(null)
    setStopped('')
    setSaved('')
    setStage('Planning the questions')
    try {
      await window.stm.research.run({ topic: topic.trim(), kinds, folder: props.cwd, cwd: props.cwd, limits: { breadth, depth } })
    } catch (e) {
      setStopped(clean(e))
    }
    setBusy(false)
    setStage('')
  }
  const uncited = new Set(done?.check.uncited ?? [])
  const full = done ? `# ${topic}\n\n${done.report}\n\n## Sources\n${done.sources.map((s) => `${s.n}. ${s.title} ${s.url}`).join('\n')}` : ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet research" role="dialog" aria-label="Research">
        <header className="sheet-head">
          <div className="sheet-title">Research</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'report'} onClick={() => setTab('report')}>Report</button>
            <button role="tab" aria-selected={tab === 'last'} onClick={() => setTab('last')}>Last 30 days</button>
            <button role="tab" aria-selected={tab === 'extract'} onClick={() => setTab('extract')}>Extract by schema</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {tab === 'extract' ? <Extract /> : tab === 'last' ? <LastDays cwd={props.cwd} onDraft={(t, b) => (props.onDraft?.(t, b), props.onClose())} /> : (
          <div className="dsg-body">
            <div className="dep-row">
              <input id="rs-topic" value={topic} placeholder="A topic, company or project, e.g. Pix payments for small shops" onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && topic.trim() && !busy && void run()} />
              {busy ? <button className="ghost small" onClick={() => void window.stm.research.stop()}>Stop</button> : <button className="primary small" disabled={topic.trim().length < 4 || kinds.length === 0} onClick={() => void run()}>Research</button>}
            </div>
            <div className="rs-opts">
              {KINDS.map((k) => (
                <label key={k.id} className="rs-kind" title={k.note}>
                  <input type="checkbox" checked={kinds.includes(k.id)} disabled={k.id === 'folder' && !props.cwd} onChange={(e) => setKinds(e.target.checked ? [...kinds, k.id] : kinds.filter((x) => x !== k.id))} />
                  {k.label}
                </label>
              ))}
              <span className="spacer-flex" />
              <label className="rs-num">Questions<select value={breadth} onChange={(e) => setBreadth(Number(e.target.value))}>{[2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label className="rs-num">Sources each<select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>{[2, 3, 4, 6, 8].map((n) => <option key={n}>{n}</option>)}</select></label>
            </div>
            <div className="faint">Two Claude calls on your plan: one plans, one writes. Searching, reading and ranking run on this machine. The budget brake checks both calls first. Topics, companies and public projects only.</div>
            {stage && <div className="rs-stage"><StateMark state="busy" label="Working" /> {stage}…</div>}
            {stopped && <div className="notice error">{stopped}</div>}
            {questions.length > 0 && (
              <ol className="rs-qs">
                {questions.map((q, i) => (
                  <li key={q}>
                    <span>{q}</span>
                    <span className="rs-reads">
                      {kinds.map((k) => {
                        const r = reads[i]?.[k]
                        return <span key={k} className={`rs-read ${r?.error ? 'bad' : r ? 'ok' : ''}`} title={r?.error ?? ''}>{TAG[k]} {r ? (r.error ? '!' : r.found) : '…'}</span>
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {done && (
              <>
                <div className="rs-check">
                  <StateMark state={done.check.uncited.length || done.check.unknown.length ? 'warn' : 'up'} label="Citations" />
                  <b>{done.check.cited} of {done.check.sentences} sentences cite a source</b>
                  <span className="faint">{done.check.used.length} of {done.sources.length} sources used · about {done.tokens.toLocaleString('en-US')} tokens sent</span>
                  <span className="spacer-flex" />
                  <button className="ghost small" onClick={() => void navigator.clipboard.writeText(full).catch(() => undefined)}>Copy</button>
                  <button className="ghost small" onClick={() => void window.stm.research.save(props.cwd ?? '', topic, done.report, done.sources).then(setSaved, (e) => setStopped(clean(e)))}>Save to project</button>
                  <button className="primary small" onClick={() => (props.onSend(full), props.onClose())}>Send to panel</button>
                </div>
                {saved && <div className="faint">Saved {saved}</div>}
                {(done.check.uncited.length > 0 || done.check.unknown.length > 0) && (
                  <div className="notice">
                    {done.check.uncited.length > 0 && <div>Without a source, check before trusting: {done.check.uncited.map((s) => `“${s}”`).join(' ')}</div>}
                    {done.check.unknown.length > 0 && <div>Cites sources that do not exist: {done.check.unknown.map((n) => `[${n}]`).join(' ')}</div>}
                  </div>
                )}
                <div className="rs-report">
                  {blocks(done.report).map((para, i) => {
                    const h = /^(#{1,3})\s+(.*)$/.exec(para)
                    if (h) return <div key={i} className={`rs-h h${h[1]!.length}`}>{h[2]}</div>
                    return <p key={i} className={[...uncited].some((u) => para.includes(u)) ? 'uncited' : ''}><Cited text={para} sources={done.sources} uncited={uncited} /></p>
                  })}
                </div>
              </>
            )}
            {sources.length > 0 && (
              <>
                <div className="sp-label">Sources · ranked by relevance, then engagement and freshness</div>
                <ol className="rs-sources">
                  {sources.map((s) => (
                    <li key={s.url} className={done && !done.check.used.includes(s.n) ? 'unused' : ''}>
                      <span className="rs-n">{s.n}</span>
                      <span className={`rs-tag ${s.kind}`}>{TAG[s.kind]}</span>
                      <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                      <span className="faint">{s.passages.length} passage{s.passages.length === 1 ? '' : 's'}{s.also.length ? ` · also seen on ${s.also.length} more` : ''}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Extract() {
  const [target, setTarget] = useState('')
  const [schema, setSchema] = useState(JSON.stringify({ type: 'object', properties: { plans: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'string' } } } } } }, null, 2))
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState('')
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true)
    setErr('')
    setOut('')
    try {
      setOut(JSON.stringify(await window.stm.research.extract(target.trim(), schema), null, 2))
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  return (
    <div className="dsg-body">
      <div className="dep-row">
        <input id="rs-target" value={target} placeholder="https://site.com/pricing or /path/to/file.md" onChange={(e) => setTarget(e.target.value)} />
        <button className="primary small" disabled={busy || !target.trim()} onClick={() => void go()}>{busy ? <><StateMark state="busy" label="Extracting" /> Extracting…</> : 'Extract'}</button>
      </div>
      <div className="faint">Runs on your local model, free: the page or file plus this JSON schema gives structured data. Pages are read with robots.txt respected.</div>
      {err && <div className="notice error">{err}</div>}
      <div className="rs-extract">
        <textarea id="rs-schema" spellCheck={false} value={schema} onChange={(e) => setSchema(e.target.value)} aria-label="JSON schema" />
        <pre className="tr-text">{out || 'The result shows here.'}</pre>
      </div>
    </div>
  )
}
