import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { clean, friendly } from './errors'
import type { Listener } from '../electron/procs'

const short = (cwd: string) => cwd.replace(/^\/(Users|home)\/[^/]+/, '~')

/** What listens on this machine's ports, refreshed while open, with a way to stop it. */
export function Ports(props: { onClose: () => void }) {
  const [list, setList] = useState<Listener[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [stopping, setStopping] = useState<Record<number, 'term' | 'kill'>>({})

  const refresh = async () => {
    try {
      setList(await window.stm.ports())
    } catch (e) {
      setErr(clean(e))
    }
  }
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [props])

  const stop = async (l: Listener) => {
    const force = stopping[l.pid] === 'term'
    setErr('')
    try {
      await window.stm.killProcess(l.pid, force)
      setStopping({ ...stopping, [l.pid]: force ? 'kill' : 'term' })
      setTimeout(() => void refresh(), 600)
    } catch (e) {
      setErr(clean(e))
    }
  }

  const needle = q.trim().toLowerCase()
  const shown = (list ?? []).filter((l) => !needle || String(l.port).startsWith(needle) || l.command.toLowerCase().includes(needle) || l.cwd.toLowerCase().includes(needle))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet ports" role="dialog" aria-label="Ports">
        <header className="sheet-head">
          <div className="sheet-title">Ports</div>
          <input className="ports-search" placeholder="Port, command or folder" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body">
          {err && <div className="notice error">{friendly(err)}</div>}
          {!list && <div className="faint">Reading ports...</div>}
          {list && shown.length === 0 && <div className="note">{needle ? 'Nothing matches.' : 'Nothing is listening on TCP.'}</div>}
          {shown.map((l) => (
            <div key={`${l.pid}-${l.port}`} className="port-row">
              <span className="port-num">{l.port}</span>
              <span className="port-main">
                <span className="port-cmd" data-tip={l.command}>{l.command}</span>
                <span className="faint port-meta" data-tip={`${l.name} · pid ${l.pid}${l.cwd ? ` · ${l.cwd}` : ''}${l.shared?.length ? ` · also held by pid ${l.shared.join(', ')}` : ''}`}>
                  {l.name} · pid {l.pid}{l.cwd ? ` · ${short(l.cwd)}` : ''}{l.shared?.length ? ` (+${l.shared.length} sharing)` : ''}{l.uptime ? ` · up ${l.uptime}` : ''} · {l.memMb} MB{l.cpu >= 1 ? ` · ${l.cpu}% CPU` : ''}
                  {l.host !== '*' && l.host !== '127.0.0.1' && l.host !== '::1' ? ` · on ${l.host}` : l.host === '*' ? ' · all interfaces' : ''}
                </span>
              </span>
              <span className="port-actions">
                <button className="ghost small" onClick={() => void window.stm.openUrl(`http://localhost:${l.port}`)}>Open</button>
                {l.mine ? (
                  <span className="faint">this app</span>
                ) : (
                  <button className={`small ${stopping[l.pid] === 'term' ? 'danger' : 'ghost'}`} onClick={() => void stop(l)} data-tip={stopping[l.pid] === 'term' ? 'Still running: send SIGKILL' : 'Send SIGTERM'}>
                    {stopping[l.pid] === 'term' ? 'Force quit' : 'Stop'}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
