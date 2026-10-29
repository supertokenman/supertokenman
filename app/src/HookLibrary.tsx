import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../shared/socaccounts'
import { clean } from './errors'
import { BUILTIN_FORMATS, MAX_SLOT, SLOT, detectFormat, fill, validateHook, type FormatId, type HookFormat } from '../shared/hookfmt'
import { Select } from './ui'

// Hook library: the four built-in caption formats, the user's own formats (localStorage only), a fill box
// and a detector. Claude is asked only when the person clicks "Write hooks"; all checks are the pure functions in shared/hookfmt.

const KEY = 'stm.social.hooks'
const MAX_LABEL = 40
const MAX_TEMPLATE = 200
const MAX_USER = 20

type UserFormat = { id: string; label: string; template: string }
type HookOption = { key: string; label: string; template: string; builtinId?: FormatId }

function templateProblem(t: string): string | null {
  if (t.length === 0 || t.length > MAX_TEMPLATE) return `Template must be 1 to ${MAX_TEMPLATE} characters`
  if (/[\r\n]/.test(t)) return 'Template must be one line'
  if (t.split(SLOT).length !== 2) return `Template needs exactly one ${SLOT}`
  return null
}

function isUserFormat(x: unknown): x is UserFormat {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.label === 'string' && typeof o.template === 'string'
    && o.label.trim() !== '' && o.label.length <= MAX_LABEL && templateProblem(o.template) === null
}

function loadUser(): UserFormat[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(isUserFormat).slice(0, MAX_USER) : []
  } catch {
    return []
  }
}

function saveUser(list: UserFormat[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function HookLibrary() {
  const [user, setUser] = useState<UserFormat[]>(loadUser)
  const [storeFailed, setStoreFailed] = useState(false)
  const [picked, setPicked] = useState<string>(`b:${BUILTIN_FORMATS[0]?.id ?? ''}`)
  const [slot, setSlot] = useState('')
  const [caption, setCaption] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftTemplate, setDraftTemplate] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<{ hooks: string[]; rejected: number } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.social.projects().then((r) => setProjects(r.list), () => undefined), [])

  const options: HookOption[] = useMemo(
    () => [
      ...BUILTIN_FORMATS.map((f) => ({ key: `b:${f.id}`, label: f.label, template: f.template, builtinId: f.id })),
      ...user.map((f) => ({ key: `u:${f.id}`, label: f.label, template: f.template })),
    ],
    [user],
  )

  const current = options.find((o) => o.key === picked) ?? options[0]

  // fill() and validateHook() read only the template; the id is a placeholder for user formats.
  const asFormat = (o: HookOption): HookFormat => ({ id: o.builtinId ?? 'choice', label: o.label, template: o.template })

  const fillView = useMemo(() => {
    if (!current) return null
    const f = asFormat(current)
    const r = fill(f, slot)
    if (r.kind === 'bad-slot') return { ok: false as const, text: '', message: cap(r.reason) }
    const v = validateHook(f, r.text)
    return v.kind === 'ok'
      ? { ok: true as const, text: r.text, message: 'Caption keeps the format shape.' }
      : { ok: false as const, text: r.text, message: cap(v.reason) }
  }, [current, slot])

  const detected = caption.trim() === '' ? null : detectFormat(caption)
  const detectedLabel = detected ? BUILTIN_FORMATS.find((f) => f.id === detected)?.label ?? null : null

  const draftProblem = draftTemplate === '' ? null : templateProblem(draftTemplate)
  const canAdd = draftLabel.trim() !== '' && draftLabel.length <= MAX_LABEL && templateProblem(draftTemplate) === null && user.length < MAX_USER

  const addFormat = () => {
    if (!canAdd) return
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const next = [...user, { id, label: draftLabel.trim(), template: draftTemplate }]
    setStoreFailed(!saveUser(next))
    setUser(next)
    setPicked(`u:${id}`)
    setDraftLabel('')
    setDraftTemplate('')
  }

  const removeFormat = (id: string) => {
    const next = user.filter((f) => f.id !== id)
    setStoreFailed(!saveUser(next))
    setUser(next)
    if (picked === `u:${id}`) setPicked(`b:${BUILTIN_FORMATS[0]?.id ?? ''}`)
  }

  const write = () => {
    if (!current) return
    setBusy(true)
    setErr('')
    window.stm.social.hooks(current.template, current.label, topic, project || undefined)
      .then((r) => setMade({ hooks: r.hooks, rejected: r.rejected.length }), (e) => setErr(clean(e)))
      .finally(() => setBusy(false))
  }

  return (
    <section aria-label="Hook library" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <div>
        <h2 style={{ margin: 0 }}>Hook library</h2>
        <p className="faint" style={{ margin: '4px 0 0' }}>Caption formats with one slot. Claude is asked only when you click Write hooks.</p>
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px' }}>Formats</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((o) => (
            <li key={o.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ minWidth: 180 }}>{o.label}</span>
              <code style={{ flex: 1 }}>{o.template}</code>
              {o.key.startsWith('u:') && (
                <button className="ghost small" data-tip="Remove this format from this app" onClick={() => removeFormat(o.key.slice(2))}>Remove</button>
              )}
            </li>
          ))}
        </ul>
        {user.length === 0 && <p className="faint" style={{ margin: '8px 0 0' }}>No formats of your own yet.</p>}
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px' }}>Fill a format</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Select aria-label="Format" value={current?.key} onChange={(e) => setPicked(e.target.value)}>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </Select>
          <input
            aria-label="Slot text"
            value={slot}
            maxLength={MAX_SLOT + 20}
            placeholder="Text for the slot, one line"
            onChange={(e) => setSlot(e.target.value)}
          />
          {current && (
            <div className="faint" style={{ fontSize: 12 }}>Template: <code>{current.template}</code></div>
          )}
          {fillView && (
            <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {fillView.text !== '' && <div>{fillView.text}</div>}
              <div className={fillView.ok ? 'faint' : ''} style={{ fontSize: 12 }}>{fillView.message}</div>
            </div>
          )}
          <input aria-label="Topic" value={topic} maxLength={2000} placeholder="Topic to write hooks about" onChange={(e) => setTopic(e.target.value)} />
          {projects.length > 0 && (
            <Select aria-label="Brand kit" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">No brand kit</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
          <div className="ob-row">
            <button className="ghost small" disabled={busy || !topic.trim() || !current} onClick={write}>{busy ? 'Writing…' : 'Write hooks'}</button>
            <span className="faint" style={{ fontSize: 12 }}>One request to the small model, only when you click. Nothing is posted.</span>
          </div>
          {err && <div className="error">{err}</div>}
          {made && (
            <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {made.hooks.length === 0 && <div className="faint">No usable hook came back. Try again or change the topic.</div>}
              {made.hooks.map((h) => <div key={h}>{h}</div>)}
              {made.rejected > 0 && <div className="faint" style={{ fontSize: 12 }}>{made.rejected} left out: wrong shape or a banned word.</div>}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px' }}>Detect a format</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            aria-label="Caption to check"
            rows={3}
            value={caption}
            placeholder="Paste a caption"
            onChange={(e) => setCaption(e.target.value)}
          />
          {caption.trim() !== '' && (
            <div aria-live="polite" style={{ fontSize: 12 }}>
              {detectedLabel
                ? <>Matches: <strong>{detectedLabel}</strong></>
                : <span className="faint">No built-in format matches. Your own formats are not checked.</span>}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px' }}>Add your own format</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            aria-label="Format name"
            value={draftLabel}
            maxLength={MAX_LABEL}
            placeholder="Name, for example Poll"
            onChange={(e) => setDraftLabel(e.target.value)}
          />
          <input
            aria-label="Template"
            value={draftTemplate}
            maxLength={MAX_TEMPLATE}
            placeholder={`Template with one ${SLOT}, for example Vote: ${SLOT}`}
            onChange={(e) => setDraftTemplate(e.target.value)}
          />
          {draftProblem && <div style={{ fontSize: 12 }}>{draftProblem}</div>}
          {user.length >= MAX_USER && <div className="faint" style={{ fontSize: 12 }}>You can keep up to {MAX_USER} formats.</div>}
          <div>
            <button className="primary small" disabled={!canAdd} onClick={addFormat}>Add format</button>
          </div>
          {storeFailed && (
            <div className="faint" style={{ fontSize: 12 }}>Formats could not be saved in this window. They stay until you close it.</div>
          )}
        </div>
      </div>
    </section>
  )
}
