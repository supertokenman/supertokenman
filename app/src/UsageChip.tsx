import { useEffect, useState } from 'react'
import { chip, rows, type Cap, type Usage } from '../shared/panelusage'

/** This panel's usage as its CLI reported it, and its own cap: reached, the next message asks first. */
export function UsageChip(props: { sid: string; refresh: unknown }) {
  const [u, setU] = useState<{ usage: Usage; cap: Cap } | null>(null)
  const [edit, setEdit] = useState<{ usd: string; tokens: string; at: { top: number; left: number } } | null>(null)
  useEffect(() => {
    if (!edit) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEdit(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit])
  useEffect(() => {
    void window.stm.panelUsage(props.sid).then(setU, () => setU(null))
  }, [props.sid, props.refresh])
  if (!u) return null
  const save = () => {
    const usd = Number(edit?.usd), tokens = Number(edit?.tokens)
    void window.stm.panelCap(props.sid, { usd: usd > 0 ? usd : undefined, tokens: tokens > 0 ? tokens : undefined }).then((cap) => setU({ ...u, cap }))
    setEdit(null)
  }
  const tip = [...rows(u.usage, u.cap).map((r) => `${r.label}: ${r.value}`), `As reported by ${u.usage.cli} on this machine.`, 'Click to set a cap for this panel.'].join('\n')
  return (
    <span className="usage-chip">
      <button className="ghost small meter-chip" data-tip={tip} onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setEdit(edit ? null : { usd: u.cap.usd ? String(u.cap.usd) : '', tokens: u.cap.tokens ? String(u.cap.tokens) : '', at: { top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) } })
        }}>
        {chip(u.usage, u.cap)}
      </button>
      {edit && (
        <span className="usage-cap" style={edit.at} role="dialog" aria-label="Cap for this panel">
          <span className="usage-cap-title">Cap for this panel</span>
          <input aria-label="Cap in US$" placeholder="US$" inputMode="decimal" size={6} autoFocus value={edit.usd} onChange={(e) => setEdit({ ...edit, usd: e.target.value })} />
          <input aria-label="Cap in tokens" placeholder="tokens" inputMode="numeric" size={9} value={edit.tokens} onChange={(e) => setEdit({ ...edit, tokens: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="ghost small" onClick={save}>Set cap</button>
        </span>
      )}
    </span>
  )
}
