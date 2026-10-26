import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { Persona } from '../shared/personas'
import { specSlug, stageMessage, taskMessage, type SpecTask } from '../shared/spec'
import { StateMark } from './StateMark'
import './bridge'

type Spec = Awaited<ReturnType<typeof window.stm.spec.list>>[number]

/**
 * Spec first: big requests become a spec, questions, a plan and tasks before code, each approved here.
 * Tasks go to the persona each one names; the list ticks itself as Claude ticks tasks.md.
 */
export function SpecSheet(props: { cwd?: string; personas: Persona[]; onClose: () => void; toPanel: (text: string) => void; toPersona: (persona: Persona | null, text: string) => void }) {
  const [specs, setSpecs] = useState<Spec[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [asked, setAsked] = useState<{ slug: string; title: string } | null>(null)
  const [view, setView] = useState<'specs' | 'constitution'>('specs')
  const [request, setRequest] = useState('')
  const [title, setTitle] = useState('')
  const [con, setCon] = useState<{ text: string; saved: boolean } | null>(null)
  const [conMsg, setConMsg] = useState('')
  const cwd = props.cwd ?? ''
  useEffect(() => {
    if (!cwd) return
    const read = () => void window.stm.spec.list(cwd).then(setSpecs, () => setSpecs([]))
    read()
    // the files change as the panel writes them: read again every few seconds while this is open
    const t = setInterval(read, 3000)
    return () => clearInterval(t)
  }, [cwd])
  useEffect(() => {
    if (view === 'constitution' && cwd && !con) void window.stm.spec.constitution(cwd).then(setCon)
  }, [view, cwd, con])
  // a spec just asked for shows as being written until its file appears
  const current: Spec | null = specs.find((s) => s.slug === pick) ?? (asked && asked.slug === pick ? { slug: asked.slug, title: asked.title, spec: false, plan: false, tasks: null, at: 0 } : null)
  const ids = props.personas.map((p) => p.id)
  const personaOf = (t: SpecTask) => props.personas.find((p) => p.id === t.persona) ?? null
  const start = () => {
    const slug = specSlug(title || request.split('\n')[0]!.slice(0, 60))
    props.toPanel(stageMessage('spec', slug, request, ids))
    setPick(slug)
    setAsked({ slug, title: title.trim() || slug })
    setRequest('')
    setTitle('')
  }
  const open = current?.tasks?.filter((t) => !t.done) ?? []

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet specs" role="dialog" aria-label="Spec first">
        <header className="sheet-head">
          <div className="sheet-title">Spec first</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={view === 'specs'} onClick={() => setView('specs')}>Specs</button>
            <button role="tab" aria-selected={view === 'constitution'} onClick={() => setView('constitution')}>Constitution</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {!cwd && <div className="note sp-body">Open a panel in a project first: specs live in its docs/specs folder.</div>}
        {cwd && view === 'specs' && (
          <div className="sp-grid">
            <aside className="sp-side">
              <div className="sp-label">In {cwd.split('/').filter(Boolean).pop()}</div>
              {specs.length === 0 && <div className="faint">No specs yet.</div>}
              {specs.map((s) => (
                <button key={s.slug} className={`sp-item ${pick === s.slug ? 'on' : ''}`} onClick={() => setPick(s.slug)}>
                  <span className="sp-item-title">{s.title}</span>
                  <span className="sp-dots" aria-label={`${s.spec ? 'spec' : ''} ${s.plan ? 'plan' : ''} ${s.tasks ? 'tasks' : ''}`}>
                    <i className={s.spec ? 'on' : ''} />
                    <i className={s.plan ? 'on' : ''} />
                    <i className={s.tasks ? 'on' : ''} />
                  </span>
                </button>
              ))}
              <button className={`sp-item new ${pick === null ? 'on' : ''}`} onClick={() => setPick(null)}>+ New spec</button>
            </aside>
            <section className="sp-main">
              {!current && (
                <div className="sp-new">
                  <label htmlFor="sp-title" className="sp-label">Name</label>
                  <input id="sp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pix at checkout" />
                  <label htmlFor="sp-request" className="sp-label">What you need</label>
                  <textarea id="sp-request" rows={6} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Customers should pay with Pix at checkout, with the QR code and copy-paste code, and the order confirmed when the payment arrives." />
                  <div className="faint">The focused panel writes the spec and up to 5 questions, then stops. No code until you approve the plan.</div>
                  <div className="sbx-actions">
                    <button className="primary small" disabled={!request.trim()} onClick={start}>Write the spec</button>
                  </div>
                </div>
              )}
              {current && (
                <div className="sp-detail">
                  <h3 className="sp-title">{current.title}</h3>
                  <ol className="sp-stages">
                    <li className={current.spec ? 'done' : 'now'}>
                      <StateMark state={current.spec ? 'up' : 'busy'} label={current.spec ? 'Written' : 'Being written'} />
                      <span>Spec and questions</span>
                      <code>docs/specs/{current.slug}/spec.md</code>
                    </li>
                    <li className={current.plan ? 'done' : current.spec ? 'next' : ''}>
                      <StateMark state={current.plan ? 'up' : 'off'} label={current.plan ? 'Written' : 'Not yet'} />
                      <span>Plan</span>
                      {current.spec && !current.plan && <button className="primary small" onClick={() => props.toPanel(stageMessage('plan', current.slug, '', ids))}>Approve the spec, write the plan</button>}
                    </li>
                    <li className={current.tasks ? 'done' : current.plan ? 'next' : ''}>
                      <StateMark state={current.tasks ? 'up' : 'off'} label={current.tasks ? 'Written' : 'Not yet'} />
                      <span>Tasks</span>
                      {current.plan && !current.tasks && <button className="primary small" onClick={() => props.toPanel(stageMessage('tasks', current.slug, '', ids))}>Approve the plan, write the tasks</button>}
                    </li>
                  </ol>
                  {current.tasks && (
                    <>
                      <div className="sp-label">
                        Tasks · {current.tasks.filter((t) => t.done).length} of {current.tasks.length} done
                      </div>
                      <div className="sp-tasks">
                        {current.tasks.map((t) => {
                          const who = personaOf(t)
                          return (
                            <div key={t.id} className={`sp-task ${t.done ? 'done' : ''}`}>
                              <span className={`sp-check ${t.done ? 'on' : ''}`} aria-label={t.done ? 'Done' : 'Open'} />
                              <b>{t.id}</b>
                              <span className="sp-task-text">{t.text}</span>
                              {t.persona && <span className="persona-chip" style={{ '--pc': who?.color ?? 'var(--muted)' } as React.CSSProperties}>{who?.name ?? t.persona}</span>}
                              {!t.done && <button className="ghost small" onClick={() => props.toPersona(who, taskMessage(current.slug, t))}>Send</button>}
                            </div>
                          )
                        })}
                      </div>
                      <div className="sbx-actions">
                        <button className="primary small" disabled={!open.length} onClick={() => props.toPersona(personaOf(open[0]!), taskMessage(current.slug, open[0]!))}>
                          {open.length ? `Send the next task (${open[0]!.id})` : 'All tasks done'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
        {cwd && view === 'constitution' && (
          <div className="sp-con">
            <div className="faint">Principles and decisions every new panel in this project follows. {con && !con.saved ? 'This is a draft from your decisions: save it to use it.' : ''}</div>
            <textarea id="sp-constitution" rows={16} value={con?.text ?? ''} onChange={(e) => con && setCon({ ...con, text: e.target.value })} />
            <div className="sbx-actions">
              {conMsg && <span className="faint">{conMsg}</span>}
              <button className="primary small" disabled={!con} onClick={async () => {
                await window.stm.spec.saveConstitution(cwd, con!.text)
                setCon({ ...con!, saved: true })
                setConMsg('Saved. Panels opened from now on follow it.')
              }}>Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
