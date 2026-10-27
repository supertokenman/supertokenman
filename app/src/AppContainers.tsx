import { useEffect, useState } from 'react'
import { IconClose, IconStop, IconTrash } from './icons'
import { RowAct, RowActs } from './RowActs'
import { clean } from './errors'
import type { Ev, Row, Use } from '../shared/containers'

/** Phase 107: the containers this app made, live; stopping or removing one is always a click and a confirm. */
export function AppContainers(props: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [use, setUse] = useState<Record<string, Use>>({})
  const [docker, setDocker] = useState(true)
  const [events, setEvents] = useState<Ev[]>([])
  const [ask, setAsk] = useState<{ id: string; name: string; act: 'stop' | 'rm' } | null>(null)
  const [err, setErr] = useState('')
  const load = () => void window.stm.appContainers.list().then((r) => (setRows(r.rows), setUse(r.use), setDocker(r.docker)), (e) => setErr(clean(e)))
  useEffect(() => {
    load()
    void window.stm.appContainers.watch(true)
    const off = window.stm.appContainers.onEvent((ev) => (setEvents((e) => [ev, ...e].slice(0, 40)), ['start', 'die', 'destroy', 'stop', 'create', 'kill'].includes(ev.action) && load()))
    const t = setInterval(load, 5000)
    return () => (off(), clearInterval(t), void window.stm.appContainers.watch(false))
  }, [])
  const act = () => ask && void window.stm.appContainers.act(ask.id, ask.act).then(() => (setAsk(null), load()), (e) => setErr(clean(e)))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ac" role="dialog" aria-label="App containers">
        <header className="sheet-head">
          <div className="sheet-title">App containers</div>
          <span className="faint">only the ones this app made (label stm=1); the Docker screen has the rest</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ac-body">
          {!docker ? <div className="faint">Docker is not answering on this machine.</div> : !rows.length ? <div className="faint">No containers from the app right now. Isolated panels and self-hosted apps show here.</div> : (
            <table className="tbl vb-table ac-table">
              <thead><tr><th>Name</th><th>Kind</th><th>Image</th><th>State</th><th>CPU</th><th>Memory</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-tip={r.name}><code>{r.name}</code></td>
                    <td><span className="pt-kind">{r.kind}</span></td>
                    <td className="faint">{r.image}</td>
                    <td><span className={`ac-state ${r.state}`}>{r.state}</span> <span className="faint">{r.status}</span></td>
                    <td className="num">{use[r.name] ? `${use[r.name]!.cpu.toFixed(1)}%` : ''}</td>
                    <td className="num">{use[r.name]?.memUsed ?? ''}</td>
                    <td className="ac-acts">
                      {ask?.id === r.id ? (
                        <>
                          <span className="mi-warn">{ask.act === 'rm' ? 'Remove it? Its data inside goes too.' : 'Stop it?'}</span>
                          <button onClick={() => setAsk(null)}>Cancel</button>
                          <button className="primary" onClick={act}>{ask.act === 'rm' ? 'Remove' : 'Stop'}</button>
                        </>
                      ) : (
                        <>
                          <RowActs>
                            {r.state === 'running' && <RowAct label={`Stop ${r.name}`} icon={<IconStop />} onClick={() => setAsk({ id: r.id, name: r.name, act: 'stop' })} />}
                            <RowAct label={`Remove ${r.name}`} icon={<IconTrash />} danger onClick={() => setAsk({ id: r.id, name: r.name, act: 'rm' })} />
                          </RowActs>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {err && <div className="bg-err">{err}</div>}
          <div className="sp-label">Events</div>
          <div className="ac-events">
            {events.length ? events.map((e, i) => <div key={i}><span className="faint">{new Date(e.at).toLocaleTimeString()}</span><code>{e.name}</code><span className={`ac-act ${e.action}`}>{e.action.replace(/_/g, ' ')}</span></div>) : <span className="faint">Waiting for Docker events from the app's containers.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
