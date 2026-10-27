import { useEffect, useState, type ReactNode } from 'react'
import { stepProgress } from '../shared/steps'
import { IconCheck } from './icons'

/** A field the person pastes into; the step ticks once it holds something. */
export interface StepField {
  value: string
  set: (v: string) => void
  placeholder: string
  secret?: boolean
}

/** One step of a setup guide: one short line and one thing to do. */
export interface GuideStep {
  id: string
  text: ReactNode
  /** the longer explanation, behind a small "Why" */
  why?: ReactNode
  /** a page to open; `browser` opens the default browser instead of the app's setup window */
  open?: { url: string; label?: string; browser?: boolean }
  /** a value or command to copy, shown in mono */
  copy?: string
  fields?: StepField[]
  /** a custom button, like Sign in */
  action?: ReactNode
  /** set when the app can see the step is complete (a tool found, signed in) */
  done?: boolean
}

export function CopyValue({ text, onCopy }: { text: string; onCopy?: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <span className="gs-copy">
      <code title={text}>{text}</code>
      <button
        className="ghost small"
        onClick={() => {
          void navigator.clipboard?.writeText(text)
          onCopy?.()
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }}
      >
        {done ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}

/** A setup guide as compact steps that tick as they happen, with progress and an optional source credit. */
export function Steps(props: { title?: string; steps: GuideStep[]; source?: { label: string; url: string }; footer?: ReactNode }) {
  const [acted, setActed] = useState<string[]>([])
  const [why, setWhy] = useState<string | null>(null)
  const did = (id: string) => setActed((a) => (a.includes(id) ? a : [...a, id]))
  const shaped = props.steps.map((s) => {
    const filled = s.fields ? s.fields.every((f) => f.value.trim()) : undefined
    return { id: s.id, done: s.done ?? filled, passive: !s.open && !s.copy && !s.fields && !s.action && s.done === undefined }
  })
  const p = stepProgress(shaped, acted)
  return (
    <div className="gs">
      <div className="gs-head">
        {props.title && <span className="gs-title">{props.title}</span>}
        <span className="spacer-flex" />
        <span className="gs-count">{p.count === p.total ? 'Done' : `${p.count} of ${p.total}`}</span>
      </div>
      <div className="gs-bar" aria-hidden>
        {props.steps.map((s) => <i key={s.id} className={p.done.has(s.id) ? 'on' : s.id === p.current ? 'now' : ''} />)}
      </div>
      <ol className="gs-list">
        {props.steps.map((s, i) => {
          const done = p.done.has(s.id)
          const now = s.id === p.current
          return (
            <li key={s.id} className={`gs-step${done ? ' done' : ''}${now ? ' now' : ''}`}>
              <span className="gs-mark" aria-label={done ? 'done' : `step ${i + 1}`}>{done ? <IconCheck /> : i + 1}</span>
              <div className="gs-main">
                <div className="gs-line">
                  <span className="gs-text">{s.text}</span>
                  {s.why && (
                    <button className={`gs-why${why === s.id ? ' on' : ''}`} aria-expanded={why === s.id} onClick={() => setWhy(why === s.id ? null : s.id)}>
                      Why
                    </button>
                  )}
                </div>
                {why === s.id && <div className="gs-why-text">{s.why}</div>}
                {(s.copy || s.open || s.fields || s.action) && (
                  <div className="gs-act">
                    {s.copy && <CopyValue text={s.copy} onCopy={() => did(s.id)} />}
                    {s.open && (
                      <button
                        className={s.copy ? 'ghost small' : 'small'}
                        onClick={() => {
                          did(s.id)
                          void (s.open!.browser ? window.stm.openUrl(s.open!.url) : window.stm.setupOpen(s.open!.url))
                        }}
                      >
                        {s.open.label ?? 'Open the page'}
                      </button>
                    )}
                    {s.fields?.map((f) => (
                      <input key={f.placeholder} className="gs-field" placeholder={f.placeholder} type={f.secret ? 'password' : 'text'} value={f.value} onChange={(e) => f.set(e.target.value)} spellCheck={false} />
                    ))}
                    {s.action}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {(props.footer || props.source) && (
        <div className="gs-foot">
          {props.footer}
          {props.source && (
            <button className="link" onClick={() => void window.stm.openUrl(props.source!.url)}>
              {props.source.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Install a command-line tool inside the app: the command to copy, a download link to the maker's page
 * (credited), and a check every few seconds that ticks the step once the tool is found.
 */
export function InstallTool(props: { name: string; command: string; site: string; url: string; installed: boolean; recheck: () => void; why?: ReactNode; next?: GuideStep[] }) {
  const { installed, recheck } = props
  useEffect(() => {
    if (installed) return
    const t = setInterval(recheck, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed])
  return (
    <Steps
      title={`Install ${props.name}`}
      steps={[{ id: 'install', text: `Run this in a terminal. The check here ticks when ${props.name} is found.`, why: props.why, copy: props.command, open: { url: props.url, label: `Other ways (opens ${props.site})`, browser: true }, done: installed }, ...(props.next ?? [])]}
      source={{ label: `Instructions from ${props.site}`, url: props.url }}
    />
  )
}
