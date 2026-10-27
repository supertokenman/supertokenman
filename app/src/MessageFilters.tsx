import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { IconClose } from './icons'
import { clean } from './errors'
import { EXAMPLE, headerOf, type MsgFilter, type Stage } from '../shared/msgfilters'

type Draft = { id?: string; code: string; valves: string; projects: string; on: boolean; order: number }
const toDraft = (f: MsgFilter): Draft => ({ id: f.id, code: f.code, valves: JSON.stringify(f.valves, null, 2), projects: f.projects.join('\n'), on: f.on, order: f.order })

/** Message filters: your own code on messages before they go (inlet) and replies before they show (outlet). */
export function MessageFiltersSheet(props: { project?: string; onClose: () => void }) {
  const [list, setList] = useState<MsgFilter[]>([])
  const [d, setD] = useState<Draft | null>(null)
  const [err, setErr] = useState('')
  const [sample, setSample] = useState('')
  const [stage, setStage] = useState<Stage>('inlet')
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => void window.stm.msgf.list().then(setList), [])
  const h = d ? headerOf(d.code) : null
  const save = (patch: Partial<Draft> = {}) => {
    if (!d) return
    const x = { ...d, ...patch }
    let valves: Record<string, unknown>
    try {
      valves = x.valves.trim() ? (JSON.parse(x.valves) as Record<string, unknown>) : {}
    } catch {
      return setErr('Valves must be JSON.')
    }
    setErr('')
    void window.stm.msgf.save({ id: x.id, code: x.code, valves, on: x.on, order: x.order, projects: x.projects.split('\n').map((p) => p.trim()).filter(Boolean) }).then((l) => {
      setList(l)
      const saved = l.find((f) => f.id === x.id) ?? l.find((f) => f.code === x.code)
      if (saved) setD(toDraft(saved))
    }, (e) => setErr(clean(e)))
  }
  const toggle = (f: MsgFilter) => void window.stm.msgf.save({ ...f, on: !f.on }).then(setList)
  const move = (f: MsgFilter, by: number) => {
    const sorted = [...list].sort((a, b) => a.order - b.order)
    const i = sorted.findIndex((x) => x.id === f.id)
    const j = i + by
    if (j < 0 || j >= sorted.length) return
    ;[sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!]
    void Promise.all(sorted.map((x, k) => window.stm.msgf.save({ ...x, order: k }))).then((r) => setList(r.at(-1) ?? list))
  }
  const test = () => {
    if (!d) return
    let valves: Record<string, unknown> = {}
    try {
      valves = d.valves.trim() ? (JSON.parse(d.valves) as Record<string, unknown>) : {}
    } catch {
      return setErr('Valves must be JSON.')
    }
    void window.stm.msgf.test(d.code, stage, sample, valves).then((r) => setOut(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.error }))
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet config observe ${!list.length && !d ? 'fit' : ''}`} role="dialog" aria-label="Message filters">
        <header className="sheet-head">
          <div className="sheet-title">Message filters</div>
          <span className="faint">your code, run in a sandbox with no network or files</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {!list.length && !d ? (
          <EmptyState title="No message filters yet" text="A filter is a short script that changes a message on its way in or out. It runs in a sandbox with no network or files."><button className="primary" onClick={() => (setD({ code: EXAMPLE, valves: JSON.stringify(headerOf(EXAMPLE).valves, null, 2), projects: '', on: false, order: 0 }), setOut(null))}>New filter</button></EmptyState>
        ) : (
        <div className="ex-grid mf-grid">
          <div className="ex-col">
            <span className="chart-name">In order</span>
            {list.length === 0 && <div className="faint">No filters yet.</div>}
            {[...list].sort((a, b) => a.order - b.order).map((f, i, all) => {
              const st = headerOf(f.code).stages
              return (
                <div key={f.id} className={`mf-row ${d?.id === f.id ? 'on' : ''}`}>
                  <input type="checkbox" checked={f.on} onChange={() => toggle(f)} aria-label={`${f.name} on`} />
                  <button className="mf-name" onClick={() => (setD(toDraft(f)), setOut(null))}>{f.name}</button>
                  <span className="faint mf-st">{st.join(' + ')}{f.projects.length ? ` · ${f.projects.length} project${f.projects.length > 1 ? 's' : ''}` : ''}</span>
                  <button className="icon" disabled={i === 0} aria-label="Earlier" onClick={() => move(f, -1)}>↑</button>
                  <button className="icon" disabled={i === all.length - 1} aria-label="Later" onClick={() => move(f, 1)}>↓</button>
                </div>
              )
            })}
            <div><button onClick={() => (setD({ code: EXAMPLE, valves: JSON.stringify(headerOf(EXAMPLE).valves, null, 2), projects: '', on: false, order: list.length }), setOut(null))}>New filter</button></div>
            <div className="faint">inlet changes your message before it goes to Claude; outlet changes how a reply is shown, not what Claude saw. A filter that throws, runs over its time or answers with something that is not text is skipped and named in the panel.</div>
          </div>
          {d ? (
            <div className="ex-col">
              <div className="ob-row"><b className="ob-grow">{h?.name}</b><span className="faint">{h?.stages.join(' + ') || 'no stage'}</span></div>
              <textarea className="ex-text mf-code" rows={14} value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} spellCheck={false} aria-label="Filter code" />
              {h?.error && <div className="notice error">{h.error}</div>}
              <span className="chart-name">Valves</span>
              <textarea className="ex-text" rows={3} value={d.valves} onChange={(e) => setD({ ...d, valves: e.target.value })} spellCheck={false} aria-label="Valves" />
              <span className="chart-name">Only in these projects (one folder a line, empty for all)</span>
              <textarea className="ex-text" rows={2} value={d.projects} placeholder={props.project ?? '/path/to/project'} onChange={(e) => setD({ ...d, projects: e.target.value })} aria-label="Projects" />
              <div className="ob-row">
                <label className="ca-toggle"><input type="checkbox" checked={d.on} onChange={(e) => setD({ ...d, on: e.target.checked })} />On</label>
                <span className="spacer-flex" />
                {d.id && <button className="danger" onClick={() => void window.stm.msgf.remove(d.id!).then((l) => (setList(l), setD(null)))}>Delete</button>}
                <button className="primary" disabled={Boolean(h?.error)} onClick={() => save()}>Save</button>
              </div>
              {err && <div className="notice error">{err}</div>}
              <span className="chart-name">Try it</span>
              <textarea className="ex-text" rows={4} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Sample text" aria-label="Sample text" />
              <div className="ob-row">
                <select className="select" value={stage} onChange={(e) => setStage(e.target.value as Stage)} aria-label="Stage"><option value="inlet">inlet</option><option value="outlet">outlet</option></select>
                <button onClick={test}>Run on the sample</button>
              </div>
              {out && <pre className={`ex-src ${out.ok ? '' : 'in-err'}`}>{out.text}</pre>}
            </div>
          ) : (
            <div className="ex-col faint">Pick a filter or start a new one.</div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
