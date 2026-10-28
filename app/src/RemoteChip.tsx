import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconRemote } from './icons'
import { clean } from './errors'

type Remote = { host: string; dir: string; branch?: string; repo?: string }

/**
 * A panel on another machine: where it runs, a port of that machine forwarded to this Mac for the
 * Browse tab, and, on a worktree of its own, merging or dropping it there. Git and the terminal of the
 * panel already run on that machine over ssh.
 */
export function RemoteChip(props: { sid: string; remote: Remote; onPreview: (url: string) => void; onDone: (note: string, close: boolean) => void }) {
  const { sid, remote } = props
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const [port, setPort] = useState('5173')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [sure, setSure] = useState<'merge' | 'drop' | null>(null)
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.remote-chip') && !busy && setOpen(false)
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open, busy])
  const forward = async () => {
    setBusy('forward')
    setMsg('')
    try {
      const r = await window.stm.remote.forward(sid, Number(port))
      props.onPreview(r.url)
      setOpen(false)
    } catch (e) {
      setMsg(clean(e))
    } finally {
      setBusy('')
    }
  }
  const worktree = async (act: 'merge' | 'drop') => {
    setBusy(act)
    setMsg('')
    try {
      props.onDone(await window.stm.remote.worktree(sid, act), true)
    } catch (e) {
      setMsg(clean(e))
      setSure(null)
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <button
        className="remote-chip"
        aria-expanded={open}
        data-tip={`Claude Code, git and the terminal of this panel run on ${remote.host} in ${remote.dir}${remote.branch ? `, on branch ${remote.branch}` : ''}.`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: Math.min(r.left, window.innerWidth - 376), y: r.bottom + 8 })
          setOpen(!open)
        }}
      >
        <IconRemote />{remote.host}<span className="faint">{remote.dir.split('/').filter(Boolean).slice(-1)[0]}</span>
      </button>
      {open &&
        createPortal(
          <div className="sbx-pop fixed rm-pop" style={{ left: at.x, top: at.y }} ref={pop} role="dialog" aria-label="Remote panel">
            <div className="sp-label">On {remote.host}</div>
            <code className="rm-dir">{remote.dir}{remote.branch ? ` · ${remote.branch}` : ''}</code>
            <div className="faint rm-note">Git (Git tab) and the terminal run there over ssh; nothing from this Mac's vault goes along.</div>
            <form className="rm-fwd" onSubmit={(e) => (e.preventDefault(), void forward())}>
              <span className="sp-label">Port</span>
              <input value={port} inputMode="numeric" onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))} aria-label="Port on the other machine" />
              <button className="small" disabled={!port || Boolean(busy)}>{busy === 'forward' ? 'Forwarding…' : 'Forward and browse'}</button>
            </form>
            <div className="faint rm-note">The port on {remote.host} opens on this Mac's localhost only, for the Browse tab.</div>
            {remote.branch && remote.repo && (
              <div className="sbx-actions">
                {sure ? (
                  <>
                    <span className="faint">{sure === 'merge' ? `Merge ${remote.branch} into ${remote.repo} on ${remote.host}?` : `Drop ${remote.branch} and its work on ${remote.host}?`}</span>
                    <button className="ghost small" onClick={() => setSure(null)}>Cancel</button>
                    <button className={sure === 'drop' ? 'danger small' : 'primary small'} disabled={Boolean(busy)} onClick={() => void worktree(sure)}>{busy ? 'Working…' : sure === 'merge' ? 'Merge' : 'Drop'}</button>
                  </>
                ) : (
                  <>
                    <button className="primary small" onClick={() => setSure('merge')}>Merge into the repository</button>
                    <button className="ghost small" onClick={() => setSure('drop')}>Drop</button>
                  </>
                )}
              </div>
            )}
            {msg && <div className="sbx-err">{msg}</div>}
          </div>,
          document.body,
        )}
    </>
  )
}
