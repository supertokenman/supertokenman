import { useEffect, useState } from 'react'
import type { NetworkId } from '../electron/social/core'
import type { NetSlots } from '../shared/postslots'
import type { Slot } from '../shared/pubcal'
import { Select, TimeField } from './ui'
import { clean } from './errors'
import './bridge'

const NAMES: Record<NetworkId, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', bluesky: 'Bluesky', mastodon: 'Mastodon' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const order = (a: Slot, b: Slot) => (a.day === b.day ? a.time.localeCompare(b.time) : (a.day + 6) % 7 - (b.day + 6) % 7)

/**
 * Weekly times for each connected network. A network's queue only takes times from its own list; a day
 * with no time is a day off for that network. Times are local time.
 */
export function SlotsEditor(props: { nets: NetworkId[]; onError: (msg: string) => void }) {
  const [all, setAll] = useState<NetSlots>({})
  const [net, setNet] = useState<NetworkId | ''>(props.nets[0] ?? '')
  const [s, setS] = useState<Slot[]>([])
  const [day, setDay] = useState(1)
  const [time, setTime] = useState('09:00')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.stm.social.netSlots().then(
      (x) => {
        setAll(x)
        setS([...(x[props.nets[0] ?? ''] ?? [])].sort(order))
      },
      (e) => props.onError(clean(e)),
    )
  }, [])

  const pick = (n: NetworkId) => {
    setNet(n)
    setS([...(all[n] ?? [])].sort(order))
  }
  const saved = net ? [...(all[net] ?? [])].sort(order) : []
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const save = () => {
    if (!net) return
    setBusy(true)
    window.stm.social.setNetSlots(net, s).then(
      (x) => {
        setAll(x)
        setS([...(x[net] ?? [])].sort(order))
        setBusy(false)
      },
      (e) => {
        setBusy(false)
        props.onError(clean(e))
      },
    )
  }

  if (props.nets.length === 0) return <div className="pc-slots"><span className="faint">Connect an account to set its weekly times.</span></div>
  return (
    <div className="pc-slots">
      <span className="sp-label">Weekly times for</span>
      <Select aria-label="Network" value={net} onChange={(e) => pick(e.target.value as NetworkId)}>
        {props.nets.map((n) => <option key={n} value={n}>{NAMES[n]}</option>)}
      </Select>
      {s.map((x, i) => (
        <button key={`${x.day}${x.time}`} className="dc-tag on" data-tip="Remove this time" onClick={() => setS(s.filter((_, k) => k !== i))}>
          {DAYS[x.day]} {x.time} ×
        </button>
      ))}
      {s.length === 0 && <span className="faint">No times yet. Days without a time are off for {NAMES[net as NetworkId]}.</span>}
      <Select aria-label="Day" value={day} onChange={(e) => setDay(Number(e.target.value))}>
        {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </Select>
      <TimeField id="pc-net-slot-time" value={time} onChange={(e) => setTime(e.target.value)} />
      <button className="ghost small" onClick={() => setS([...s.filter((x) => !(x.day === day && x.time === time)), { day, time }].sort(order))}>Add</button>
      <span className="spacer-flex" />
      <button className="primary small" disabled={!dirty || busy} onClick={save}>Save times</button>
    </div>
  )
}
