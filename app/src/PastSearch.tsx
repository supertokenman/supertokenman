import { Fragment, useEffect, useRef, useState } from 'react'
import { IconClose, IconHistory } from './icons'
import type { PastHit } from '../electron/pastsearch'
import type { PastTurn } from '../shared/pastsearch'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
const when = (at: string) => {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  return days < 1 ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : days < 7 ? `${days} d ago` : d.toLocaleDateString()
}
const place = (cwd: string) => cwd.split('/').filter(Boolean).slice(-2).join('/') || cwd

/** Text with the matched words bold; the ranges come from the index, never markup. */
function Marked(props: { text: string; marks: [number, number][] }) {
  const out: JSX.Element[] = []
  let at = 0
  props.marks.forEach(([a, b], i) => {
    out.push(<Fragment key={`t${i}`}>{props.text.slice(at, a)}</Fragment>, <mark key={`m${i}`}>{props.text.slice(a, b)}</mark>)
    at = b
  })
  out.push(<Fragment key="end">{props.text.slice(at)}</Fragment>)
  return <>{out}</>
}

/**
 * Search past sessions: every turn of every Claude Code session on this Mac, by what you asked and what
 * came back. A hit opens a panel that picks the conversation up right after that turn.
 */
export function PastSearchSheet(props: { cwd?: string; onClose: () => void; onOpen: (hit: PastHit) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [here, setHere] = useState(Boolean(props.cwd))
  const [res, setRes] = useState<Awaited<ReturnType<typeof window.stm.past.search>> | null>(null)
  const [mode, setMode] = useState<'words' | 'meaning' | 'both'>(() => {
    try {
      return (localStorage.getItem('stm.pastMode') as 'words' | 'meaning' | 'both') || 'both'
    } catch {
      return 'both'
    }
  })
  const [indexing, setIndexing] = useState(false)
  const [sel, setSel] = useState(0)
  const [ctx, setCtx] = useState<PastTurn[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const tick = useRef(0)
  useEffect(() => {
    const id = ++tick.current
    const t = setTimeout(() => void window.stm.past.search(q, here ? props.cwd : undefined, mode).then((r) => id === tick.current && (setRes(r), setSel(0)), (e) => setErr(clean(e))), q ? (mode === 'words' ? 180 : 400) : 0)
    return () => clearTimeout(t)
  }, [q, here, mode])
  const pickMode = (m: 'words' | 'meaning' | 'both') => {
    setMode(m)
    try {
      localStorage.setItem('stm.pastMode', m)
    } catch {
      // storage off: the choice lasts while the sheet is open
    }
  }
  const indexAll = () => (setIndexing(true), void window.stm.past.index().then((v) => (setIndexing(false), setRes((r) => (r ? { ...r, vec: { done: v.done, total: v.total } } : r))), (e) => (setIndexing(false), setErr(clean(e)))))
  const hit = res?.hits[sel]
  useEffect(() => {
    setCtx(null)
    if (hit) void window.stm.past.around(hit.file, hit.n).then(setCtx, () => setCtx([]))
  }, [hit?.file, hit?.n])
  const go = async (h: PastHit) => {
    setBusy(true)
    setErr('')
    try {
      await props.onOpen(h)
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ps" role="dialog" aria-label="Search past sessions">
        <header className="sheet-head">
          <div className="sheet-title">Past sessions</div>
          <span className="faint">{res ? `${res.turns.toLocaleString()} turns in ${res.files.toLocaleString()} sessions` : ''}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        <div className="ps-bar">
          <input autoFocus placeholder={mode === 'words' ? 'Words from a past prompt or reply; "exact phrase", -leave-out' : 'What it was about, in your words: "when the login broke after a deploy"'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((i) => Math.min((res?.hits.length ?? 1) - 1, i + 1)))
            else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((i) => Math.max(0, i - 1)))
            else if (e.key === 'Enter' && hit && !busy) void go(hit)
            else if (e.key === 'Escape') props.onClose()
          }} aria-label="Search past sessions" />
          <div className="segmented" role="group" aria-label="How">
            {(['words', 'meaning', 'both'] as const).map((m) => <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => pickMode(m)}>{m === 'words' ? 'Words' : m === 'meaning' ? 'Meaning' : 'Both'}</button>)}
          </div>
          {props.cwd && (
            <div className="segmented" role="group" aria-label="Where">
              <button className={here ? 'on' : ''} onClick={() => setHere(true)}>{place(props.cwd)}</button>
              <button className={here ? '' : 'on'} onClick={() => setHere(false)}>All projects</button>
            </div>
          )}
        </div>
        {mode !== 'words' && res && (
          <div className="ps-vec">
            {!res.vec ? <span className="faint">Meaning search needs a local embedding model (Local model, Embeddings). Words still work.</span> : (
              <>
                <span className="ps-vec-bar"><i style={{ width: `${res.vec.total ? (res.vec.done / res.vec.total) * 100 : 0}%` }} /></span>
                <span className="faint">{res.vec.done.toLocaleString()} of {res.vec.total.toLocaleString()} turns understood by meaning, on this Mac</span>
                {res.vec.done < res.vec.total && <button className="ghost small" disabled={indexing} onClick={indexAll}>{indexing ? 'Reading…' : 'Read the rest now'}</button>}
              </>
            )}
            {res.note && <span className="ps-note">{res.note}</span>}
          </div>
        )}
        <div className="ps-body">
          <div className="ps-list" role="listbox" aria-label="Turns found">
            {!q ? <div className="faint ps-empty">Type to search what you asked and what came back, in every session on this Mac. Nothing leaves it.</div>
              : res && !res.hits.length ? <div className="faint ps-empty">No turn matches.</div>
              : res?.hits.map((h, i) => (
                <button key={`${h.file}:${h.n}`} role="option" aria-selected={i === sel} className={`ps-hit ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)} onDoubleClick={() => void go(h)}>
                  <span className="ps-meta"><b>{place(h.cwd)}</b>{h.branch && <span>{h.branch}</span>}<span>turn {h.n}/{h.of}</span>{h.by && <span className="ps-by">{h.by.length > 1 ? 'words + meaning' : h.by[0]}</span>}{!h.by && h.score !== undefined && <span className="ps-by">meaning {Math.round(h.score * 100)}%</span>}<span className="ps-when">{when(h.at)}</span></span>
                  <span className="ps-prompt"><Marked {...h.prompt} /></span>
                  {h.reply.text && <span className="ps-reply faint"><Marked {...h.reply} /></span>}
                </button>
              ))}
          </div>
          <div className="ps-preview">
            {hit ? (
              <>
                <div className="ps-preview-head">
                  <span className="fld-label">Around turn {hit.n}</span>
                  <span className="spacer-flex" />
                  <button className="primary small" disabled={busy} onClick={() => void go(hit)}>{busy ? <StateMark state="busy" label="Opening" /> : <IconHistory />}Open at this turn</button>
                </div>
                {!ctx ? <div className="faint"><StateMark state="busy" label="Reading" /> Reading the session…</div> : ctx.map((t) => (
                  <div key={t.n} className={`ps-turn ${t.n === hit.n ? 'hit' : t.n > hit.n ? 'after' : ''}`}>
                    <div className="ps-turn-n">{t.n}</div>
                    <div className="ps-turn-body">
                      <div className="ps-you">{t.prompt.slice(0, 600)}</div>
                      {t.reply && <div className="ps-claude">{t.reply.slice(0, 900)}</div>}
                      {t.tools.length > 0 && <div className="ps-tools">{t.tools.join(' · ')}</div>}
                    </div>
                  </div>
                ))}
                <div className="faint">Opening picks the conversation up after turn {hit.n}, as a new branch of the session; the turns after it stay in the original.</div>
              </>
            ) : <div className="faint">Pick a turn to read it with the ones around it.</div>}
            {err && <div className="notice error">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
