import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { RoleHero } from './RoleHero'
import { ACCESS, COLORS, type Access, type Persona } from '../shared/personas'
import { STYLE_IDS, STYLES, type StyleId } from '../shared/styles'
import { AUTONOMY, type Autonomy } from '../shared/autonomy'
import type { IntegrationInfo } from './bridge'
import { clean } from './errors'
import { IntegrationMark } from './IntegrationMark'

const MODEL_OPTIONS = [
  { id: '', label: 'App default' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
]
const modelLabel = (id: string) => MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id

const blank = (): Persona => ({ id: '', name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)]!, model: '', integrations: [], instructions: '' })

/** The access level as a pictogram: an open eye reads, a cut square edits, a square with a dot asks. */
export function AccessMark({ access }: { access: Access }) {
  return (
    <svg className={`acc-mark acc-${access}`} viewBox="0 0 12 12" aria-hidden>
      {access === 'read' && <><path d="M1 6s2-3.5 5-3.5S11 6 11 6 9 9.5 6 9.5 1 6 1 6Z" /><circle cx="6" cy="6" r="1.5" /></>}
      {access === 'ask' && <><rect x="1.5" y="1.5" width="9" height="9" /><path d="M6 4v2.5M6 8.2v.1" /></>}
      {access === 'edit' && <path d="M1.5 1.5h9v6l-3 3h-6zM4 8l4-4" />}
    </svg>
  )
}

/** Personas: a role, a model and integrations for a panel. Open one, edit it, or pass it to a colleague as a file. */
export function Personas(props: { onClose: () => void; onOpen: (id: string) => void }) {
  const [list, setList] = useState<Persona[] | null>(null)
  const [ints, setInts] = useState<IntegrationInfo[]>([])
  const [edit, setEdit] = useState<Persona | null>(null)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  useEffect(() => {
    void window.stm.personas.list().then(setList)
    void window.stm.integrations().then(setInts)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (edit ? setEdit(null) : props.onClose())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props, edit])

  const run = async (fn: () => Promise<Persona[] | string | null>, done?: (r: Persona[] | string | null) => string | undefined) => {
    setMsg(null)
    try {
      const r = await fn()
      if (Array.isArray(r)) setList(r)
      const text = done?.(r)
      if (text) setMsg({ text })
    } catch (e) {
      setMsg({ text: clean(e), bad: true })
    }
  }
  const nameOf = (id: string) => ints.find((i) => i.id === id)?.name ?? id

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet personas" role="dialog" aria-label="Personas">
        <header className="sheet-head">
          <div className="sheet-title">Personas</div>
          <span className="faint">A role, a model and its integrations for a panel.</span>
          <span className="spacer-flex" />
          <button className="ghost small" onClick={() => void run(() => window.stm.personas.importFiles(), () => 'Imported.')}>Import</button>
          <button className="primary small" onClick={() => setEdit(blank())}>New persona</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body">
          {msg && <div className={`notice ${msg.bad ? 'error' : ''}`}>{msg.text}</div>}
          {edit ? (
            <Editor
              p={edit}
              ints={ints}
              onCancel={() => setEdit(null)}
              onSave={(p) =>
                void run(
                  () => window.stm.personas.save(p),
                  () => {
                    setEdit(null)
                    return `Saved ${p.name}.`
                  },
                )
              }
            />
          ) : (
            <div className="persona-grid">
              {list?.map((p) => (
                <div key={p.id} className="persona-card" style={{ '--pc': p.color } as React.CSSProperties}>
                  <div className="pcard-top">
                    <RoleHero p={p} size={40} />
                    <div className="pcard-name">{p.name}</div>
                    <span className="pill">{modelLabel(p.model)}</span>
                    {(p.access ?? 'ask') !== 'ask' && <span className={`acc-badge acc-${p.access}`} role="img" aria-label={ACCESS[p.access!].label} title={`${ACCESS[p.access!].label}: ${ACCESS[p.access!].what}`}><AccessMark access={p.access!} /></span>}
                  </div>
                  <div className="pcard-text">{p.instructions || 'No instructions yet.'}</div>
                  <div className="pcard-ints">
                    {p.integrations.length ? p.integrations.map((id) => <span key={id} className="pcard-int"><IntegrationMark id={id} name={nameOf(id)} group={ints.find((i) => i.id === id)?.group} size={14} />{nameOf(id)}</span>) : <span className="faint">Integrations from Connections</span>}
                  </div>
                  <div className="pcard-actions">
                    <button className="primary small" onClick={() => { props.onOpen(p.id); props.onClose() }}>Open panel</button>
                    <button className="ghost small" onClick={() => setEdit(p)}>Edit</button>
                    <button className="ghost small" onClick={() => void run(() => window.stm.personas.exportFile(p.id), (r) => (typeof r === 'string' ? `Exported to ${r}` : undefined))}>Export</button>
                    <button className="ghost small pcard-del" onClick={() => void run(() => window.stm.personas.remove(p.id))}>Delete</button>
                  </div>
                </div>
              ))}
              {list?.length === 0 && (
                <div className="sheet-empty">
                  <div className="se-title">No personas</div>
                  <div className="se-text">Create one, or import a .persona.md a colleague sent you.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Editor(props: { p: Persona; ints: IntegrationInfo[]; onSave: (p: Persona) => void; onCancel: () => void }) {
  const [p, setP] = useState(props.p)
  const set = (patch: Partial<Persona>) => setP({ ...p, ...patch })
  const toggle = (id: string) => set({ integrations: p.integrations.includes(id) ? p.integrations.filter((x) => x !== id) : [...p.integrations, id] })
  return (
    <div className="persona-edit">
      <div className="pe-row">
        <input className="pe-name" placeholder="Name, e.g. Reviewer" value={p.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        <div className="pe-colors" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button key={c} className={`pe-color ${p.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} aria-checked={p.color === c} role="radio" onClick={() => set({ color: c })} />
          ))}
        </div>
        <select value={p.model} onChange={(e) => set({ model: e.target.value })}>
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="group">What it may do</div>
      <div className="pe-access" role="radiogroup" aria-label="What it may do">
        {(Object.keys(ACCESS) as Access[]).map((k) => (
          <button key={k} role="radio" aria-checked={(p.access ?? 'ask') === k} className={`pe-acc ${(p.access ?? 'ask') === k ? 'on' : ''} acc-${k}`} onClick={() => set({ access: k })}>
            <AccessMark access={k} />
            <span className="pe-acc-label">{ACCESS[k].label}</span>
            <span className="pe-acc-what">{ACCESS[k].what}</span>
          </button>
        ))}
      </div>
      <div className="group">Commands</div>
      <div className="style-picker autonomy-picker" role="radiogroup" aria-label="Commands">
        {(Object.keys(AUTONOMY) as Autonomy[]).map((k) => {
          const on = (p.autonomy ?? 'supervised') === k
          return (
            <button key={k} type="button" role="radio" aria-checked={on} className={`style-opt ${on ? 'on' : ''}`} onClick={() => set({ autonomy: k })}>
              <span className="style-box" aria-hidden />
              <span className="style-label">{AUTONOMY[k].label}</span>
              <span className="style-what">{AUTONOMY[k].what}</span>
            </button>
          )
        })}
      </div>
      <div className="group">How it answers</div>
      <StylePicker value={p.styles ?? []} onChange={(styles) => set({ styles })} />
      <textarea className="pe-text" placeholder="What this persona does and how: its job, what to check, what never to do." value={p.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      <div className="group">Integrations {p.integrations.length ? `(${p.integrations.length})` : '(none picked: the ones on in Connections)'}</div>
      <div className="pe-ints">
        {props.ints.map((i) => (
          <label key={i.id} className={`pe-int ${p.integrations.includes(i.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={p.integrations.includes(i.id)} onChange={() => toggle(i.id)} />
            <IntegrationMark id={i.id} name={i.name} group={i.group} size={16} />
            {i.name}
          </label>
        ))}
      </div>
      <div className="pe-foot">
        <button className="ghost small" onClick={props.onCancel}>Cancel</button>
        <button className="primary small" disabled={!p.name.trim() || !p.instructions.trim()} onClick={() => props.onSave(p)}>Save</button>
      </div>
    </div>
  )
}

/** The answer styles as toggles: each adds a short rule to what Claude is told. */
export function StylePicker(props: { value: StyleId[]; onChange: (v: StyleId[]) => void }) {
  return (
    <div className="style-picker" role="group" aria-label="How it answers">
      {STYLE_IDS.map((id) => {
        const on = props.value.includes(id)
        return (
          <button key={id} type="button" role="switch" aria-checked={on} className={`style-opt ${on ? 'on' : ''}`} onClick={() => props.onChange(on ? props.value.filter((x) => x !== id) : [...props.value, id])}>
            <span className="style-box" aria-hidden />
            <span className="style-label">{STYLES[id].label}</span>
            <span className="style-what">{STYLES[id].what}</span>
          </button>
        )
      })}
    </div>
  )
}
