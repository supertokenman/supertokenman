import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { fieldsOf, type Filter, type Prompt } from '../shared/workbench'
import type { Persona } from '../shared/personas'
import type { WbState } from './bridge'
import { clean } from './errors'
import './bridge'

const close = (
  <IconClose />
)
const when = (t: number) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * The Workbench: your prompt library (/name in any panel, {{fields}} asked before sending, versions),
 * the prompts.chat collection (CC0) to start from, and filters per persona. Ideas from Open WebUI; no
 * code from it.
 */
export function WorkbenchSheet(props: { onClose: () => void }) {
  const [tab, setTab] = useState<'library' | 'catalog' | 'filters'>('library')
  const [st, setSt] = useState<WbState | null>(null)
  const [err, setErr] = useState('')
  const act = (p: Promise<WbState>) => void p.then((s) => (setSt(s), setErr('')), (e) => setErr(clean(e)))
  useEffect(() => act(window.stm.wb.state()), [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Workbench">
        <header className="sheet-head">
          <div className="sheet-title">Workbench</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}>Library</button>
            <button role="tab" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')}>prompts.chat</button>
            <button role="tab" aria-selected={tab === 'filters'} onClick={() => setTab('filters')}>Filters</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {!st ? <div className="dsg-body faint">{err || 'Reading…'}</div> : tab === 'library' ? <Library st={st} act={act} err={err} /> : tab === 'catalog' ? <Catalog st={st} act={act} err={err} onAdopted={() => setTab('library')} /> : <Filters st={st} act={act} />}
      </div>
    </div>
  )
}

function Library(props: { st: WbState; act: (p: Promise<WbState>) => void; err: string }) {
  const { st } = props
  const [pick, setPick] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Prompt> | null>(null)
  const [note, setNote] = useState('')
  const p = st.prompts.find((x) => x.id === pick) ?? st.prompts[0]
  useEffect(() => setForm(p ? { ...p } : { name: '', title: '', body: '', tags: [] }), [p?.id, p?.at])
  const fields = fieldsOf(form?.body ?? '')
  return (
    <div className="cf-body">
      <div className="cf-col ob-list">
        <div className="ob-row"><button className="primary" onClick={() => (setPick('new'), setForm({ name: '', title: '', body: '', tags: [] }))}>New prompt</button></div>
        {!st.prompts.length && <div className="faint">No prompts yet. Write one, or start from the prompts.chat tab. Type /name in any panel to use it.</div>}
        {st.prompts.map((x) => (
          <button key={x.id} className={`ob-turn ${x === p && pick !== 'new' ? 'on' : ''}`} onClick={() => setPick(x.id)}>
            <span className="ob-turn-top"><span>/{x.name}</span><span className="faint">{x.source === 'prompts.chat' ? 'prompts.chat' : ''}</span></span>
            <span className="ob-turn-prompt faint">{x.title}</span>
          </button>
        ))}
      </div>
      <div className="cf-col">
        {form && (
          <>
            <div className="mn-form">
              <label>Name, typed as /name<input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Title<input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label className="wide">Text, with {'{{fields}}'} or {'{{field | default}}'}<textarea rows={10} value={form.body ?? ''} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
              <label className="wide">Tags<input placeholder="comma separated" value={(form.tags ?? []).join(', ')} onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map((t) => t.trim()) })} /></label>
            </div>
            <div className="faint">{fields.length ? `Asked before sending: ${fields.map((f) => f.name + (f.default ? ` (default ${f.default})` : '')).join(', ')}.` : 'No fields: it goes as written, followed by whatever you type after /name.'}</div>
            <div className="ob-row">
              <input className="ob-grow" placeholder="What changed (kept with the old version)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="primary" onClick={() => (props.act(window.stm.wb.save(pick === 'new' ? { ...form, id: undefined } : form, note)), setNote(''), pick === 'new' && setPick(null))}>Save</button>
              {form.id && <button onClick={() => (props.act(window.stm.wb.remove(form.id!)), setPick(null))}>Delete</button>}
            </div>
            {!!p?.versions?.length && pick !== 'new' && (
              <>
                <div className="ob-label">Earlier versions</div>
                {p.versions.map((v) => (
                  <div key={v.at} className="mn-inc wb-ver">
                    <span>{when(v.at)}</span>
                    <span className="ob-sum faint">{v.note ?? v.body.slice(0, 80)}</span>
                    <button onClick={() => props.act(window.stm.wb.save({ ...p, body: v.body }, `Restored the version of ${when(v.at)}`))}>Restore</button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
        {props.err && <div className="notice error">{props.err}</div>}
      </div>
    </div>
  )
}

function Catalog(props: { st: WbState; act: (p: Promise<WbState>) => void; err: string; onAdopted: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<Prompt[]>([])
  const [pick, setPick] = useState<Prompt | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => void window.stm.wb.catalog(q).then((l) => (setList(l), setPick((p) => (p && l.includes(p) ? p : l[0] ?? null)))), [q, props.st.catalogCount])
  if (!props.st.catalogCount)
    return (
      <div className="dsg-body">
        <div className="faint">prompts.chat is a large open collection of prompts, dedicated to the public domain (CC0). Download it once (about 8 MB) and copy the ones you like into your library.</div>
        <div className="ob-row"><button className="primary" disabled={busy} onClick={() => (setBusy(true), props.act(window.stm.wb.importCatalog().finally(() => setBusy(false))))}>{busy ? 'Downloading…' : 'Download prompts.chat'}</button></div>
        {props.err && <div className="notice error">{props.err}</div>}
      </div>
    )
  return (
    <div className="cf-body">
      <div className="cf-col ob-list">
        <div className="ob-row"><input className="ob-grow" placeholder={`Search ${props.st.catalogCount} prompts`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.map((x) => (
          <button key={x.id} className={`ob-turn ${x === pick ? 'on' : ''}`} onClick={() => setPick(x)}>
            <span className="ob-turn-top"><span>{x.title}</span><span className="faint">{x.tags.includes('dev') ? 'dev' : ''}</span></span>
            <span className="ob-turn-prompt faint">{x.body}</span>
          </button>
        ))}
      </div>
      <div className="cf-col">
        {pick && (
          <>
            <div className="ob-prompt">{pick.title}</div>
            <pre className="ob-pre">{pick.body}</pre>
            <div className="ob-row">
              <button className="primary" onClick={() => (props.act(window.stm.wb.adopt(pick.id)), props.onAdopted())}>Copy to my library</button>
              <span className="faint">From prompts.chat, CC0. Downloaded {props.st.catalogAt ? when(props.st.catalogAt) : ''}.</span>
            </div>
          </>
        )}
        <div className="ob-row"><button disabled={busy} onClick={() => (setBusy(true), props.act(window.stm.wb.importCatalog().finally(() => setBusy(false))))}>{busy ? 'Downloading…' : 'Update the collection'}</button></div>
      </div>
    </div>
  )
}

function Filters(props: { st: WbState; act: (p: Promise<WbState>) => void }) {
  const [personas, setPersonas] = useState<Persona[]>([])
  useEffect(() => void window.stm.personas.list().then(setPersonas), [])
  const rows = [{ id: '*', name: 'Every panel without a persona' }, ...personas]
  const names = Object.entries(props.st.filterNames) as [Filter, string][]
  return (
    <div className="dsg-body">
      <div className="faint">Filters add short rules to each message a panel sends, in this order. They show in Trace with the message. A persona's own list replaces the default one.</div>
      <table className="tbl ob-table wb-filters">
        <thead><tr><th>Panel</th>{names.map(([k, v]) => <th key={k}>{v}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const on = props.st.filters[r.id] ?? []
            return (
              <tr key={r.id}>
                <td>{r.name}</td>
                {names.map(([k]) => (
                  <td key={k}><input type="checkbox" aria-label={`${props.st.filterNames[k]} for ${r.name}`} checked={on.includes(k)} onChange={(e) => props.act(window.stm.wb.setFilters(r.id, e.target.checked ? [...on, k] : on.filter((x) => x !== k)))} /></td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
