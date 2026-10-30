import { useEffect, useState } from 'react'
import { Switch, confirmDialog } from '../ui'
import { markOf, type PanelRun } from '../panelview'
import { StateMark } from '../StateMark'

/** Settings > Keep panels running: off by default; the text says what it costs. Lazy: Appearance loads it when opened. */
export function RuntimeSettings() {
  const [k, setK] = useState<{ on: boolean; available: boolean } | null>(null)
  const [live, setLive] = useState<{ sid: string; run: PanelRun }[]>([])
  useEffect(() => {
    const rt = window.stm.runtime
    if (!rt) return
    void rt.keepRunning().then(setK, () => setK(null))
    const load = () => void rt.states().then((v) => setLive(v.filter((x) => x.state !== 'closed').map((x) => ({ sid: x.panel, run: { state: x.state, reason: x.reason, since: x.since } }))), () => undefined)
    load()
    return rt.onState(load)
  }, [])
  if (!k) return null
  const stopAll = async () => {
    if (await confirmDialog({ title: 'Stop all panels?', message: `This stops ${live.length === 1 ? '1 panel' : `${live.length} panels`} now. Their conversations stay and can be resumed.`, confirm: 'Stop all' })) await window.stm.runtime.stopAll()
  }
  return (
    <>
      <div className="tid-row" data-tip="Panels that are working keep going after you close the window or press Cmd+Q. A menu bar item shows what is running and what it costs; Quit there stops everything.">
        <span>Keep panels running</span>
        <Switch disabled={!k.available} checked={k.on} onChange={(e) => void window.stm.runtime.keepRunning(e.target.checked).then(setK)} />
      </div>
      <div className="rt-note faint">Panels keep running and spending after you close SuperTokenMan.{!k.available ? ' Needs macOS.' : ''}</div>
      {k.on && live.length > 0 && (
        <div className="rt-live">
          {live.map(({ sid, run }) => {
            const m = markOf(run)
            return m ? <div key={sid} className="rt-row"><StateMark state={m.state} shape={m.shape} label={m.label} /><span>{m.label}</span><span className="faint rt-id">{sid.slice(0, 8)}</span></div> : null
          })}
          <button className="small danger" onClick={() => void stopAll()}>Stop all</button>
        </div>
      )}
    </>
  )
}
