import { useEffect, useMemo, useRef, useState } from 'react'
import { IconClose } from './icons'
import { clean } from './errors'
import { asJson, estimate, type Extracted, type FieldSpec } from '../shared/extract'
import { Checkbox } from './ui'

const KEY = 'stm.extract.fields'
const load = (): FieldSpec[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') as FieldSpec[]
  } catch {
    return [{ name: 'error', description: 'An error message, as written', many: true }, { name: 'version', description: 'The app version' }]
  }
}

/** Extract: fields out of a log, spec or issue, each pointing at the words it came from. */
export function ExtractSheet(props: { project?: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [fields, setFields] = useState<FieldSpec[]>(load)
  const [examples, setExamples] = useState('')
  const [items, setItems] = useState<Extracted[] | null>(null)
  const [busy, setBusy] = useState<{ done: number; of: number } | null>(null)
  const [cost, setCost] = useState(0)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<number | null>(null)
  const src = useRef<HTMLPreElement>(null)
  useEffect(() => window.stm.extract.onProgress(setBusy), [])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(fields))
    } catch {
      // a convenience
    }
  }, [fields])
  const est = useMemo(() => (text ? estimate(text, fields) : null), [text, fields])
  const run = () => {
    setErr('')
    setItems(null)
    setBusy({ done: 0, of: est?.chunks ?? 1 })
    void window.stm.extract.run(text, fields, examples, props.project ?? '').then((r) => (setItems(r.items), setCost(r.costUsd)), (e) => setErr(clean(e))).finally(() => setBusy(null))
  }
  useEffect(() => {
    if (pick === null) return
    src.current?.querySelector(`[data-i="${pick}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [pick])
  // the text with the grounded spans marked, in order, overlaps skipped
  const marked = useMemo(() => {
    if (!items) return null
    const spans = items.map((it, i) => ({ ...it, i })).filter((x) => x.span).sort((a, b) => a.span!.start - b.span!.start)
    const out: (string | { i: number; t: string })[] = []
    let at = 0
    for (const s of spans) {
      if (s.span!.start < at) continue
      out.push(text.slice(at, s.span!.start), { i: s.i, t: text.slice(s.span!.start, s.span!.end) })
      at = s.span!.end
    }
    out.push(text.slice(at))
    return out
  }, [items, text])
  const bad = items?.filter((i) => !i.span).length ?? 0
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Extract with sources">
        <header className="sheet-head">
          <div className="sheet-title">Extract with sources</div>
          <span className="faint">every value shows the words it came from</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ex-grid">
          <div className="ex-col">
            <span className="chart-name">Fields</span>
            {fields.map((f, i) => (
              <div key={i} className="ex-field">
                <input value={f.name} placeholder="name" aria-label="Field name" onChange={(e) => setFields(fields.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                <input value={f.description} placeholder="what it is" aria-label="Field description" onChange={(e) => setFields(fields.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
                <label className="ex-many" data-tip="Can appear many times"><Checkbox checked={Boolean(f.many)} onChange={(e) => setFields(fields.map((x, k) => (k === i ? { ...x, many: e.target.checked } : x)))} />many</label>
                <button className="icon" aria-label={`Remove ${f.name || 'field'}`} onClick={() => setFields(fields.filter((_, k) => k !== i))}><IconClose /></button>
              </div>
            ))}
            <div><button onClick={() => setFields([...fields, { name: '', description: '' }])}>Add field</button></div>
            <details className="s2c-file"><summary>Examples (optional)</summary><textarea rows={4} value={examples} onChange={(e) => setExamples(e.target.value)} placeholder='text: "ERROR disk full" gives error = disk full' aria-label="Examples" /></details>
            <span className="chart-name">Text</span>
            <textarea className="ex-text" rows={10} value={text} onChange={(e) => (setText(e.target.value), setItems(null))} placeholder="Paste a log, a spec or an issue, or open a file" aria-label="Text" spellCheck={false} />
            <div className="ob-row">
              <label className="btn ex-file">Open a file<input type="file" accept=".txt,.log,.md,.json,.csv,.yaml,.yml,.xml,.html" onChange={(e) => void e.target.files?.[0]?.text().then((t) => (setText(t), setItems(null)))} hidden /></label>
              {est && <span className="faint">{est.chunks} part{est.chunks === 1 ? '' : 's'} · about {(est.tokensIn / 1000).toFixed(1)}k tokens in</span>}
              <span className="spacer-flex" />
              {busy ? <button onClick={() => void window.stm.extract.stop()}>Stop ({busy.done}/{busy.of})</button> : <button className="primary" disabled={!text.trim() || !fields.some((f) => f.name.trim())} onClick={run}>Extract</button>}
            </div>
            {err && <div className="notice error">{err}</div>}
          </div>
          <div className="ex-col">
            {items ? (
              <>
                <div className="ob-row"><span className="chart-name ob-grow">{items.length - bad} with a source{bad ? `, ${bad} rejected` : ''}</span>{cost > 0 && <span className="faint">US$ {cost.toFixed(4)}</span>}<button onClick={() => void navigator.clipboard.writeText(asJson(items))}>Copy JSON</button></div>
                <table className="tbl ex-table">
                  <thead><tr><th>Field</th><th>Value</th><th>Source</th></tr></thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className={`${it.span ? '' : 'ex-bad'} ${pick === i ? 'on' : ''}`} onClick={() => it.span && setPick(i)}>
                        <td><code>{it.field}</code></td>
                        <td>{it.value}</td>
                        <td>{it.span ? <span className="faint">chars {it.span.start} to {it.span.end}</span> : <span className="ex-why">{it.why} <q>{it.quote}</q></span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <pre ref={src} className="ex-src">{marked?.map((m, k) => (typeof m === 'string' ? m : <mark key={k} data-i={m.i} className={pick === m.i ? 'on' : ''} onClick={() => setPick(m.i)}>{m.t}</mark>))}</pre>
              </>
            ) : (
              <div className="faint">Results show here. A value whose quote is not word for word in the text is marked rejected, never kept as true.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
