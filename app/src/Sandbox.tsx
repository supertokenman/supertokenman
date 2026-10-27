import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StateMark } from './StateMark'
import './bridge'
import { Checkbox } from './ui'

type Change = { path: string; kind: 'added' | 'changed' | 'deleted' }

/** A box with its lid shut: the brand's pictogram for work that runs walled off. */
export function SandboxMark({ size = 16 }: { size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 5L8 2l6 3v6l-6 3-6-3z" />
      <path d="M2 5l6 3 6-3M8 8v6" />
    </svg>
  )
}

const useOutside = (open: boolean, close: () => void, also?: string) => {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && !(also && (e.target as Element).closest?.(also)) && close()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open, close, also])
  return root
}

/**
 * The top bar's sandbox button: a new panel in the focused folder whose Claude Code runs inside an
 * OpenShell sandbox. Shown only when OpenShell is installed; tells what is missing otherwise.
 */
export function SandboxButton({ cwd, onOpen }: { cwd?: string; onOpen: (cwd: string | undefined) => Promise<unknown> }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.sandbox.status>> | null>(null)
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const root = useOutside(open, () => !busy && setOpen(false))
  useEffect(() => {
    void window.stm.sandbox.status().then(setSt)
  }, [])
  useEffect(() => window.stm.sandbox.onLog((l) => setLog((x) => [...x.slice(-5), l])), [])
  if (!st?.installed) return null
  const start = async () => {
    setBusy(true)
    setErr('')
    setLog([])
    try {
      await window.stm.sandbox.prepare(cwd ?? '')
      await onOpen(cwd)
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sbx" ref={root}>
      <button className="ghost icon" onClick={() => setOpen(!open)} aria-expanded={open} data-tip="New panel in a sandbox (OpenShell)" aria-label="New panel in a sandbox (OpenShell)">
        <SandboxMark />
      </button>
      {open && (
        <div className="sbx-pop" role="dialog" aria-label="Sandbox">
          <div className="sp-label">Panel in a sandbox</div>
          <p className="sbx-what">Claude Code works on a copy of {cwd ? <b>{cwd.split('/').pop()}</b> : 'the folder'} inside OpenShell. It reaches Anthropic, npm, PyPI and GitHub to read, nothing else. Your credential stays out of it. Its changes come back only when you bring them back.</p>
          <div className="sbx-state">
            <StateMark state={st.gateway ? 'up' : 'warn'} label={st.gateway ? 'Gateway running' : 'Gateway not running'} />
            <span>{st.version}</span>
            <span className="faint">{st.gateway ? 'gateway up' : /Mac/.test(navigator.platform) ? 'start it: brew services restart openshell' : 'start it: systemctl --user restart openshell-gateway'}</span>
          </div>
          {log.length > 0 && (
            <div className="sbx-log">
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
          {err && <div className="sbx-err">{err}</div>}
          <div className="sbx-actions">
            <button className="primary small" disabled={busy || !st.gateway} onClick={() => void start()}>
              {busy ? <StateMark state="busy" label="Getting the sandbox ready" /> : null}
              {busy ? 'Getting ready' : 'Open in sandbox'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const KIND = { added: 'A', changed: 'M', deleted: 'D' } as const

/** The panel's sandbox chip: what changed in the sandbox's copy, and bringing the picked files back. */
export function SandboxChip({ cwd }: { cwd: string }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Change[] | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const root = useOutside(open, () => !busy && setOpen(false), '.sbx-pop.fixed')
  const look = async () => {
    setBusy(true)
    setMsg('')
    try {
      const l = await window.stm.sandbox.changes(cwd)
      setList(l)
      // deletions are never picked for you
      setPick(new Set(l.filter((c) => c.kind !== 'deleted').map((c) => c.path)))
    } catch (e) {
      setMsg(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setBusy(false)
    }
  }
  const bring = async () => {
    setBusy(true)
    try {
      const n = await window.stm.sandbox.apply(cwd, [...pick])
      await look()
      setMsg(n === 1 ? 'Brought 1 file back.' : `Brought ${n} files back.`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sbx" ref={root}>
      <button
        className="sbx-chip"
        onClick={(e) => {
          // the panel bar clips what overflows it, so the list is placed on the window
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: Math.min(r.left, window.innerWidth - 356), y: r.bottom + 8 })
          setOpen(!open)
          if (!open) void look()
        }}
        aria-expanded={open}
        data-tip="This panel runs in an OpenShell sandbox. Click to see its changes and bring them back."
      >
        <SandboxMark size={12} />
        Sandbox
      </button>
      {open &&
        createPortal(
        <div className="sbx-pop fixed" style={{ left: at.x, top: at.y }} role="dialog" aria-label="Sandbox changes">
          <div className="sp-label">Changes in the sandbox</div>
          {busy && !list && <StateMark state="busy" label="Reading the sandbox's copy" />}
          {list && !list.length && <div className="faint">Its copy matches your folder.</div>}
          {list && list.length > 0 && (
            <div className="sbx-list">
              {list.map((c) => (
                <label key={c.path} className={`sbx-row ${c.kind}`}>
                  <Checkbox checked={pick.has(c.path)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(c.path); else n.delete(c.path); return n })} />
                  <b>{KIND[c.kind]}</b>
                  <span data-tip={c.path}>{c.path}</span>
                </label>
              ))}
            </div>
          )}
          {msg && <div className="faint">{msg}</div>}
          <div className="sbx-actions">
            <button className="ghost small" disabled={busy} onClick={() => void look()}>Refresh</button>
            <button className="primary small" disabled={busy || !pick.size} onClick={() => void bring()}>{pick.size ? `Bring ${pick.size} back` : 'Bring back'}</button>
          </div>
        </div>,
          document.body,
        )}
    </div>
  )
}
