import { useEffect, useRef, useState } from 'react'
import type { Kind, Peripheral } from '../electron/peripherals'

const lowestOf = (p: Peripheral) => {
  const parts = p.levels.filter((l) => l.part !== 'case')
  const use = parts.length ? parts : p.levels
  return use.length ? Math.min(...use.map((l) => l.percent)) : null
}
const tone = (n: number | null) => (n === null ? 'none' : n <= 10 ? 'crit' : n <= 20 ? 'low' : n <= 40 ? 'mid' : 'full')
const PART = { main: '', left: 'L', right: 'R', case: 'Case' } as const

/** Our own pictograms for each kind of device, on the brand's 16 grid. */
function DeviceGlyph({ kind }: { kind: Kind }) {
  return (
    <svg className="dv-glyph" viewBox="0 0 16 16" aria-hidden>
      {kind === 'mac' && <path d="M3 3.5h10v7H3zM1 12.5h14" />}
      {kind === 'headphones' && <path d="M3 10V8a5 5 0 0 1 10 0v2M2.5 10h2.5v4H2.5zM11 10h2.5v4H11z" />}
      {kind === 'mouse' && <><rect x="4.5" y="2" width="7" height="12" rx="3.5" /><path d="M8 2v4" /></>}
      {kind === 'keyboard' && <><rect x="1.5" y="4.5" width="13" height="7" /><path d="M4 7h1M7 7h1M10 7h2M4.5 9.5h7" /></>}
      {kind === 'trackpad' && <><rect x="2" y="3" width="12" height="10" /><path d="M2 10.5h12" /></>}
      {kind === 'speaker' && <><rect x="4" y="1.5" width="8" height="13" /><circle cx="8" cy="10" r="2.2" /><circle cx="8" cy="4.5" r="0.8" /></>}
      {kind === 'controller' && <path d="M3 5h10l2 6-2.5 1.5L10 10H6l-2.5 2.5L1 11zM5 7v2M4 8h2M10.5 7.5h.01M12 8.5h.01" />}
      {kind === 'other' && <path d="M5 4l6 4-6 4M8 1v14" />}
    </svg>
  )
}

/** A battery as the brand draws it: a cut-corner cell filled to its level; it pulses low and sweeps charging. */
export function Cell({ percent, charging, size = 'sm' }: { percent: number | null; charging?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span className={`dv-cell ${size} ${tone(percent)} ${charging ? 'charging' : ''}`} role="img" aria-label={percent === null ? 'Battery not reported' : `${percent}%${charging ? ', charging' : ''}`}>
      <i style={{ width: `${percent ?? 0}%` }} />
    </span>
  )
}

/**
 * The battery of the Bluetooth devices around the Mac, in the top bar: the device that needs charging
 * first, and a list of all of them with each part (AirPods per bud and case). Hidden when none report.
 */
export function DevicesButton() {
  const [list, setList] = useState<Peripheral[] | null>(null)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void window.stm.devices.get().then(setList)
    const off = window.stm.devices.on(setList)
    return off
  }, [])
  useEffect(() => {
    if (!open) return
    void window.stm.devices.get().then(setList)
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  // the Mac's own battery is in the list, never the one the top bar points at: macOS shows that already
  const withLevel = (list ?? []).filter((d) => d.kind !== 'mac' && lowestOf(d) !== null)
  if (!withLevel.length) return null
  const first = withLevel[0]!
  const low = lowestOf(first)
  return (
    <div className="dv" ref={root}>
      <button className={`ghost icon dv-btn ${tone(low)}`} onClick={() => setOpen(!open)} aria-expanded={open} title={`${first.name}: ${low}%${first.charging ? ', charging' : ''}`}>
        <DeviceGlyph kind={first.kind} />
        <Cell percent={low} charging={first.charging} />
        {low !== null && low <= 20 && <span className="dv-pct">{low}%</span>}
      </button>
      {open && (
        <div className="dv-pop" role="dialog" aria-label="Devices">
          <div className="sp-label">Batteries</div>
          {(list ?? []).map((d) => {
            const l = lowestOf(d)
            return (
              <div key={d.name} className={`dv-row ${tone(l)}`}>
                <DeviceGlyph kind={d.kind} />
                <div className="dv-info">
                  <div className="dv-name" title={d.name}>{d.name}</div>
                  {d.levels.length ? (
                    <div className="dv-parts">
                      {d.levels.map((p) => (
                        <span key={p.part} className="dv-part">
                          {PART[p.part] && <b>{PART[p.part]}</b>}
                          <Cell percent={p.percent} charging={d.charging && p.part === 'main'} size="md" />
                          <span className="dv-num">{p.percent}%</span>
                        </span>
                      ))}
                      {d.charging && <span className="dv-charging">charging</span>}
                    </div>
                  ) : (
                    <div className="faint dv-none">Connected; it does not report its battery</div>
                  )}
                </div>
              </div>
            )
          })}
          <div className="faint dv-foot">Read every 3 minutes. Under 20% you get a notification once.</div>
        </div>
      )}
    </div>
  )
}
