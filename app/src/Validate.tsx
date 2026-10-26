import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean, friendly } from './errors'
import type { Check, Research } from '../electron/naming'

const KIND: Record<Check['kind'], string> = { domain: 'Domain', npm: 'npm', pypi: 'PyPI', github: 'GitHub' }

/** One lookup as a tile: the shape says the answer before the word does. */
function Tile({ c }: { c: Check }) {
  return (
    <button className={`val-tile ${c.verdict}`} onClick={() => void window.stm.openUrl(c.url)} title={c.note ?? c.url}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        {c.verdict === 'free' ? <circle cx="11" cy="11" r="8" /> : c.verdict === 'taken' ? <rect x="3" y="3" width="16" height="16" rx="2" /> : <path d="M11 3 19 18H3z" />}
      </svg>
      <span className="val-label">{c.label}</span>
      <span className="val-kind">{KIND[c.kind]} · {c.verdict === 'free' ? 'free' : c.verdict === 'taken' ? 'taken' : 'no answer'}</span>
      {c.note && <span className="val-note">{c.note}</span>}
    </button>
  )
}

/** Validate a product: is the name free, who is it for, who else does it. Free lookups; research on your plan. */
export function Validate(props: { onClose: () => void }) {
  const [idea, setIdea] = useState('')
  const [name, setName] = useState('')
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [links, setLinks] = useState<{ trademarks: { label: string; url: string }[]; handles: { label: string; url: string }[] } | null>(null)
  const [research, setResearch] = useState<Research | null>(null)
  const [busy, setBusy] = useState({ name: false, research: false })
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const run = async () => {
    setErr('')
    if (name.trim()) {
      setBusy((b) => ({ ...b, name: true }))
      setChecks(null)
      Promise.all([window.stm.naming.check(name), window.stm.naming.links(name)])
        .then(([c, l]) => {
          setChecks(c)
          setLinks(l)
        })
        .catch((e) => setErr(clean(e)))
        .finally(() => setBusy((b) => ({ ...b, name: false })))
    }
    if (idea.trim()) {
      setBusy((b) => ({ ...b, research: true }))
      setResearch(null)
      window.stm.naming
        .research(idea, name)
        .then(setResearch)
        .catch((e) => setErr(clean(e)))
        .finally(() => setBusy((b) => ({ ...b, research: false })))
    }
  }
  const free = checks?.filter((c) => c.verdict === 'free').length ?? 0

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet validate" role="dialog" aria-label="Validate a product">
        <header className="sheet-head">
          <div className="sheet-title">Validate</div>
          <span className="faint">Name, audience and competitors before you build.</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body val">
          <form className="val-ask" onSubmit={(e) => { e.preventDefault(); void run() }}>
            <input className="val-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" spellCheck={false} />
            <input className="val-idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="The idea in one line: who it is for and what it does" />
            <button className="primary small" disabled={busy.name || busy.research || (!name.trim() && !idea.trim())}>Check</button>
          </form>
          {err && <div className="notice error">{friendly(err)}</div>}

          {(checks || busy.name) && (
            <section>
              <div className="val-head">
                <span className="group">The name</span>
                {checks && <span className="val-score"><b>{free}</b>/{checks.length} free</span>}
                <span className="val-legend faint"><i className="free" /> free <i className="taken" /> taken <i className="unknown" /> no answer</span>
              </div>
              <div className="val-tiles">
                {busy.name && !checks && Array.from({ length: 9 }, (_, i) => <div key={i} className="val-tile skeleton" />)}
                {checks?.map((c) => <Tile key={c.kind + c.label} c={c} />)}
              </div>
              {links && (
                <div className="val-links">
                  <span className="faint">Trademark, check by hand:</span>
                  {links.trademarks.map((l) => <button key={l.label} className="chip" onClick={() => void window.stm.openUrl(l.url)}>{l.label}</button>)}
                  <span className="faint">Handles:</span>
                  {links.handles.map((l) => <button key={l.label} className="chip" onClick={() => void window.stm.openUrl(l.url)}>{l.label}</button>)}
                </div>
              )}
            </section>
          )}

          {(research || busy.research) && (
            <section>
              <div className="val-head"><span className="group">The market</span>{busy.research && <span className="faint"><span className="spinner" /> Claude is searching the web</span>}</div>
              {research && (
                <>
                  {research.summary && <p className="val-summary">{research.summary}</p>}
                  <div className="val-grid">
                    <div className="val-col">
                      <div className="val-sub">Who it is for</div>
                      {research.audience.map((a, i) => (
                        <div key={i} className="val-persona">
                          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="9" r="5" /><path d="M3 24c1.5-5 5.5-7.5 10-7.5S21.5 19 23 24" /></svg>
                          <span><b>{a.who}</b><span className="faint">{a.pain}</span></span>
                        </div>
                      ))}
                    </div>
                    <div className="val-col">
                      <div className="val-sub">Who else does it</div>
                      {research.competitors.map((c, i) => (
                        <button key={i} className="val-comp" onClick={() => c.url && void window.stm.openUrl(c.url)}>
                          <span className="val-comp-mark">{c.name.slice(0, 1).toUpperCase()}</span>
                          <span><b>{c.name}</b><span className="faint">{c.angle}</span></span>
                          {c.price && c.price !== 'unknown' && <span className="badge">{c.price}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  {research.positioning && <div className="val-position"><span className="val-sub">Your angle</span>{research.positioning}</div>}
                  <div className="val-grid">
                    {research.names.length > 0 && (
                      <div className="val-col">
                        <div className="val-sub">Other names to check</div>
                        <div className="val-names">{research.names.map((n) => <button key={n} className="chip" onClick={() => { setName(n); setChecks(null) }}>{n}</button>)}</div>
                      </div>
                    )}
                    {research.risks.length > 0 && (
                      <div className="val-col">
                        <div className="val-sub">Risks</div>
                        {research.risks.map((r, i) => <div key={i} className="val-risk">{r}</div>)}
                      </div>
                    )}
                  </div>
                  <p className="faint val-fine">Lookups are public registries at this moment; a free domain can be taken in a minute. Research is Claude reading the web: check the links. Neither replaces a trademark lawyer.</p>
                </>
              )}
            </section>
          )}

          {!checks && !research && !busy.name && !busy.research && (
            <div className="val-empty">
              <svg viewBox="0 0 240 90" aria-hidden="true">
                <circle cx="40" cy="45" r="26" className="free" />
                <rect x="96" y="19" width="52" height="52" rx="5" className="taken" />
                <path d="M200 19 226 71H174z" className="unknown" />
              </svg>
              <span className="faint">Type a name, an idea, or both.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
