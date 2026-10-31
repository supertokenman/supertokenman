import { useEffect, useState } from 'react'
import './control.css'
import type { Trigger } from '../../shared/triggers'
import type { CapsInfo } from './types'

/** The caps line over the trigger list: "12 of 20 enabled". */
export function CapsLine(props: { refresh: unknown }) {
  const [i, setI] = useState<CapsInfo | null>(null)
  useEffect(() => {
    window.stm.triggers.caps().then(setI, () => setI(null))
  }, [props.refresh])
  if (!i) return null
  const full = i.enabled >= i.caps.maxEnabled
  return (
    <div className={`cap-line${full ? ' full' : ''}`} role="status">
      <b>{i.enabled} of {i.caps.maxEnabled}</b> enabled
      <span>Shortest interval {i.caps.minEvery} min. Off after {i.caps.maxFailures} failed runs in a row.</span>
      {full && <span>At the limit: turn one off to enable another.</span>}
    </div>
  )
}

/** Shown on a trigger the app switched off after repeated failures. */
export function DisabledNote(props: { t: Trigger; onEnable: () => void }) {
  return (
    <div className="cap-off">
      <b>Off</b>
      <span>{props.t.note ?? 'Switched off after repeated failed runs.'}</span>
      <button className="ghost small" onClick={props.onEnable}>Re-enable</button>
    </div>
  )
}
