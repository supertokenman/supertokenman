import { useEffect, useState } from 'react'
import { NumberField, Switch } from '../ui'
import { Profiles } from './Profiles'
import type { Settings } from './types'
import './abrowser.css'

const api = () => window.stm.agentBrowser

/** Settings > Security & Privacy > Agent browser: off by default. Lazy: Appearance loads it when opened. */
export function AgentBrowserSettings() {
  const [on, setOn] = useState<boolean | null>(null)
  const [cfg, setCfg] = useState<Settings | null>(null)
  useEffect(() => {
    const b = window.stm?.agentBrowser
    if (!b) return
    void b.enabled().then(setOn, () => setOn(null))
    void b.settings().then(setCfg, () => setCfg(null))
    return b.onEnabled(setOn)
  }, [])
  if (on === null) return null
  const save = (patch: Parameters<ReturnType<typeof api>['settings']>[0]) => void api().settings(patch).then(setCfg)
  const num = (key: 'steps' | 'screenshots' | 'newHosts', label: string, min: number, max: number) => (
    <label>
      <span className="ab-label">{label}</span>
      <NumberField aria-label={label} min={min} max={max} value={cfg?.limits[key] ?? ''} onChange={(e) => e.target.value && save({ limits: { [key]: Number(e.target.value) } })} />
    </label>
  )
  return (
    <div className="ab-set">
      <div className="tid-row" data-tip="Lets a panel's assistant open and use web pages in a browser pane beside the panel. Every new site asks you first. Off: no browser, no network.">
        <span>Agent browser</span>
        <Switch aria-label="Agent browser" checked={on} onChange={(e) => void api().enabled(e.target.checked).then(setOn)} />
      </div>
      <div className="rt-note faint">A browser beside the panel that the assistant can use. It has its own sign-ins, asks before each new site, and stops at CAPTCHAs for you. Nothing is requested while this is off.</div>
      {on && cfg && (
        <>
          <div className="tid-row">
            <span>Let the assistant look at screenshots</span>
            <Switch aria-label="Let the assistant look at screenshots" checked={cfg.screenshots} onChange={(e) => save({ screenshots: e.target.checked })} />
          </div>
          <div className="ab-limits">
            {num('steps', 'Steps per task', 5, 200)}
            {num('screenshots', 'Screenshots per task', 0, 50)}
            {num('newHosts', 'New sites per task', 1, 30)}
            <label>
              <span className="ab-label">Minutes per task</span>
              <NumberField aria-label="Minutes per task" min={1} max={120} value={Math.round(cfg.limits.wallMs / 60_000)} onChange={(e) => e.target.value && save({ limits: { wallMs: Number(e.target.value) * 60_000 } })} />
            </label>
          </div>
          <div className="ab-label ab-set-head">Profiles</div>
          <Profiles />
        </>
      )}
    </div>
  )
}
