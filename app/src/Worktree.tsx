import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { createPortal } from 'react-dom'
import { StateMark } from './StateMark'
import './bridge'

export type PanelWorktree = { branch: string; base: string; repo: string; group?: string; attempt?: number; of?: number }
type Stat = Awaited<ReturnType<typeof window.stm.worktree.stat>>

/** A branch splitting off: the brand's pictogram for work kept on its own branch. */
export function BranchMark({ size = 14 }: { size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <path d="M4 4.5v7M12 6.5c0 3-8 2.5-8 5" />
    </svg>
  )
}

/**
 * The panel's worktree chip: what its branch changed, and the way out. Merge brings the work into the
 * branch it started from; Drop throws the worktree and branch away; for one of several attempts, Keep
 * this one merges it and drops the others.
 */
export function WorktreeChip(props: { sid: string; wt: PanelWorktree; hasPreview: boolean; onPreview: () => void; onDone: (note: string, close: string[]) => void }) {
  const { sid, wt } = props
  const [open, setOpen] = useState(false)
  const [stat, setStat] = useState<Stat | undefined>()
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [sure, setSure] = useState(false)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    void window.stm.worktree.stat(sid).then(setStat, () => setStat(null))
    const away = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.wt-chip') && !busy && setOpen(false)
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open, sid, busy])
  const attempt = wt.group && wt.attempt ? `Attempt ${wt.attempt} of ${wt.of}` : null
  const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
  const merge = async (keep: boolean) => {
    setBusy(keep ? 'keep' : 'merge')
    setMsg('')
    try {
      const message = `${attempt ? `${attempt}: ` : ''}work from panel ${sid} on ${wt.branch}`
      if (keep) {
        const r = await window.stm.worktree.keep(sid, message)
        if (!r.merged) setMsg(r.why ?? 'Not merged.')
        else props.onDone(`Kept this attempt: merged into ${wt.base}. The other attempts were dropped.`, [sid, ...r.closed])
      } else {
        const r = await window.stm.worktree.merge(sid, message)
        if (!r.merged) setMsg(r.why ?? 'Not merged.')
        else props.onDone(`Merged into ${wt.base} and removed the worktree.`, [sid])
      }
    } catch (e) {
      setMsg(clean(e))
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <button
        className="wt-chip"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: Math.min(r.left, window.innerWidth - 376), y: r.bottom + 8 })
          setOpen(!open)
        }}
        aria-expanded={open}
        data-tip={`${attempt ? `${attempt}, in its` : 'Its'} own worktree on ${wt.branch}, from ${wt.base}`}
      >
        <BranchMark size={12} />
        {wt.group && wt.attempt ? `${wt.attempt}/${wt.of}` : wt.branch.replace(/^stm\//, '')}
      </button>
      {open &&
        createPortal(
          <div className="sbx-pop fixed wt-pop" style={{ left: at.x, top: at.y }} ref={pop} role="dialog" aria-label="Worktree">
            <div className="sp-label">{attempt ? `${attempt} · ` : ''}branch {wt.branch}</div>
            {stat === undefined && <StateMark state="busy" label="Reading the changes" />}
            {stat && (
              <div className="wt-stat">
                <b>{stat.files}</b> {stat.files === 1 ? 'file' : 'files'} changed against {wt.base} <span className="wt-add">+{stat.added}</span> <span className="wt-del">−{stat.removed}</span>
              </div>
            )}
            {stat && stat.list.length > 0 && (
              <div className="sbx-list">
                {stat.list.slice(0, 40).map((f) => (
                  <div key={f.path} className="sbx-row changed">
                    <span />
                    <b>M</b>
                    <span data-tip={f.path}>{f.path}</span>
                  </div>
                ))}
              </div>
            )}
            {msg && <div className="sbx-err">{msg}</div>}
            <div className="sbx-actions">
              {props.hasPreview && <button className="ghost small" onClick={props.onPreview}>Preview</button>}
              {sure ? (
                <>
                  <span className="faint">Drop {stat?.files ? `${stat.files} changed files` : 'it'}?</span>
                  <button className="ghost small" onClick={() => setSure(false)}>Keep</button>
                  <button className="danger small" disabled={Boolean(busy)} onClick={async () => {
                    setBusy('drop')
                    await window.stm.worktree.drop(sid).catch(() => false)
                    setBusy('')
                    props.onDone(`Dropped the worktree and branch ${wt.branch}.`, [sid])
                  }}>Drop</button>
                </>
              ) : (
                <>
                  <button className="ghost small" onClick={() => setSure(true)}>Drop</button>
                  {attempt && <button className="small" onClick={() => window.dispatchEvent(new CustomEvent('stm:fanout', { detail: { group: wt.group } }))}>Scoreboard</button>}
                  {attempt ? (
                    <button className="primary small" disabled={Boolean(busy) || !stat?.files} onClick={() => void merge(true)}>{busy === 'keep' ? <StateMark state="busy" label="Merging" /> : null}Keep this one</button>
                  ) : (
                    <button className="primary small" disabled={Boolean(busy) || !stat?.files} onClick={() => void merge(false)}>{busy === 'merge' ? <StateMark state="busy" label="Merging" /> : null}Merge into {wt.base}</button>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/**
 * One prompt, tried several ways: each attempt in its own worktree, with its own model, side by side.
 * The person compares the results and keeps one; the rest are dropped.
 */
export function TryWaysSheet(props: { cwd?: string; models: { id: string; label: string }[]; onClose: () => void; onStart: (prompt: string, models: string[]) => Promise<void> }) {
  const [prompt, setPrompt] = useState('')
  const [picked, setPicked] = useState<string[]>(() => props.models.filter((m) => m.id).slice(0, 2).map((m) => m.id))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && props.onClose()}>
      <div className="sheet tryways" role="dialog" aria-label="Try several ways">
        <header className="sheet-head">
          <div className="sheet-title">Try several ways</div>
          <span className="faint">Each in its own worktree; keep the best</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="tw-body">
          <label className="tw-field" htmlFor="tw-prompt">What to do in {props.cwd ? <b>{props.cwd.split('/').filter(Boolean).pop()}</b> : 'the focused folder'}</label>
          <textarea id="tw-prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Make the settings page responsive" />
          <div className="sp-label">Attempts, 2 or 3 (each one a full turn of your plan)</div>
          <div className="tw-models">
            {props.models.map((m) => (
              <button key={m.id || 'default'} className={`chip-toggle ${picked.includes(m.id) ? 'on' : ''}`} aria-pressed={picked.includes(m.id)} onClick={() => toggle(m.id)}>{m.label}</button>
            ))}
          </div>
          {err && <div className="sbx-err">{err}</div>}
          <div className="sbx-actions">
            <button className="primary small" disabled={busy || !prompt.trim() || picked.length < 2} onClick={async () => {
              setBusy(true)
              setErr('')
              try {
                await props.onStart(prompt.trim(), picked)
                props.onClose()
              } catch (e) {
                setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
              } finally {
                setBusy(false)
              }
            }}>{busy ? <StateMark state="busy" label="Starting" /> : null}Start {picked.length} attempts</button>
          </div>
        </div>
      </div>
    </div>
  )
}
