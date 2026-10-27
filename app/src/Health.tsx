import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { friendly } from './errors'
import type { Part } from '../electron/health'

const COLOR: Record<Part['kind'], string> = { app: 'var(--muted)', window: 'var(--accent)', webapp: 'var(--blue)', preview: 'var(--gold)', claude: 'var(--green)', other: 'var(--faint)' }
const KIND: Record<Part['kind'], string> = { app: 'App', window: 'Window', webapp: 'Web app', preview: 'Preview', claude: 'Claude Code', other: 'Other' }

/** What each part of the app costs now, refreshed every 2 seconds, with a way to put the heavy ones to sleep. */
export function HealthSheet({ onClose }: { onClose: () => void }) {
  const [parts, setParts] = useState<Part[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const pull = () => window.stm.health().then(setParts, (e: Error) => setErr(e.message))
    void pull()
    const t = setInterval(pull, 2000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const mem = (parts ?? []).reduce((n, p) => n + p.memMb, 0)
  const cpu = (parts ?? []).reduce((n, p) => n + p.cpu, 0)
  const top = Math.max(1, ...(parts ?? []).map((p) => p.memMb))
  const fmt = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet health" role="dialog" aria-label="Health">
        <header className="sheet-head">
          <div className="sheet-title">Health</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body hl">
          {err && <div className="notice error">{friendly(err)}</div>}
          <div className="hl-hero">
            <span className="hl-big"><b>{fmt(mem)}</b>memory</span>
            <span className="hl-big"><b className={cpu > 60 ? 'hot' : ''}>{Math.round(cpu)}%</b>CPU now</span>
            <span className="hl-big"><b>{parts?.filter((p) => p.kind === 'webapp').length ?? 0}</b>web apps awake</span>
          </div>
          <div className="sp-bar hl-bar">
            {(parts ?? []).map((p) => <span key={p.id} style={{ flexGrow: p.memMb, background: COLOR[p.kind] }} data-tip={`${p.label}: ${fmt(p.memMb)}`} role="img" aria-label={`${p.label}: ${fmt(p.memMb)}`} />)}
          </div>
          <div className="hl-legend">
            {(Object.keys(KIND) as Part['kind'][]).filter((k) => parts?.some((p) => p.kind === k)).map((k) => <span key={k}><i style={{ background: COLOR[k] }} />{KIND[k]}</span>)}
          </div>
          <div className="hl-rows">
            {parts?.map((p) => (
              <div key={p.id} className="hl-row">
                <span className="hl-dot" style={{ background: COLOR[p.kind] }} />
                <span className="hl-label">{p.label}</span>
                <span className="hl-mem"><span style={{ width: `${(p.memMb / top) * 100}%`, background: COLOR[p.kind] }} /></span>
                <span className="hl-num">{fmt(p.memMb)}</span>
                <span className={`hl-num ${p.cpu > 25 ? 'hot' : ''}`}>{p.cpu.toFixed(1)}%</span>
                <span className="hl-act">
                  {p.kind === 'webapp' && p.app && <button className="ghost small" onClick={() => window.dispatchEvent(new CustomEvent('stm:webapp-sleep', { detail: { app: p.app } }))}>Sleep</button>}
                  {p.kind === 'claude' && p.sid && <button className="ghost small" data-tip="Ends its Claude Code process; the next message resumes the conversation" onClick={() => void window.stm.sleepPanel(p.sid!)}>Sleep</button>}
                </span>
              </div>
            ))}
          </div>
          {(parts?.filter((p) => p.kind === 'webapp').length ?? 0) > 1 && (
            <button className="small hl-all" onClick={() => parts?.filter((p) => p.kind === 'webapp' && p.app).forEach((p) => window.dispatchEvent(new CustomEvent('stm:webapp-sleep', { detail: { app: p.app } })))}>
              Sleep all web apps ({fmt((parts ?? []).filter((p) => p.kind === 'webapp').reduce((n, p) => n + p.memMb, 0))})
            </button>
          )}
          <p className="faint hl-fine">Memory is what each process holds now. Sleeping a web app unloads it until you open it; sleeping a panel ends its Claude Code process and the next message picks the conversation back up.</p>
        </div>
      </div>
    </div>
  )
}
