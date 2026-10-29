import { useEffect, useState } from 'react'
import type { NetworkId, Post } from '../electron/social/core'
import { bestTimes, MIN_BUCKETS, MIN_POSTS, type BestTime as Result, type Metric, type OwnPost } from '../shared/besttime'
import { Select } from './ui'
import { clean } from './errors'
import './bridge'

const NAMES: Record<NetworkId, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', bluesky: 'Bluesky', mastodon: 'Mastodon' }
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** YouTube reports views; other networks report engagement when the posts carry any count at all. */
function metricFor(net: NetworkId, posts: Post[]): Metric | null {
  if (posts.length === 0) return 'engagement'
  if (net === 'youtube') return posts.some((p) => p.views !== undefined) ? 'views' : null
  return posts.some((p) => p.likes !== undefined || p.comments !== undefined || p.shares !== undefined) ? 'engagement' : null
}

/**
 * The best-time card: our own recent posts on one network, scored on this device. Reads the posts only
 * when a network is picked; nothing is sent anywhere.
 */
export function BestTime(props: { nets: NetworkId[] }) {
  const [net, setNet] = useState<NetworkId | ''>(props.nets[0] ?? '')
  const [out, setOut] = useState<{ net: NetworkId; metric: Metric | null; result: Result } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!net) return
    let live = true
    setBusy(true)
    setErr('')
    window.stm.social
      .posts(net)
      .then((list) => {
        if (!live) return
        const metric = metricFor(net, list)
        const ps: OwnPost[] = list.map((p) => ({ at: Date.parse(p.at), likes: p.likes, comments: p.comments, shares: p.shares, views: p.views }))
        setOut({ net, metric, result: bestTimes(ps, metric) })
      })
      .catch((e) => live && setErr(clean(e)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [net])

  if (props.nets.length === 0) return <div className="pc-slots"><span className="faint">Connect an account to see its best times.</span></div>
  const name = net ? NAMES[net] : ''
  const shown = out && out.net === net ? out : null
  return (
    <div className="pc-slots pc-best">
      <span className="sp-label">Best time</span>
      <Select aria-label="Network for best time" value={net} onChange={(e) => setNet(e.target.value as NetworkId)}>
        {props.nets.map((n) => <option key={n} value={n}>{NAMES[n]}</option>)}
      </Select>
      {err && <span className="notice error">{err}</span>}
      {!err && busy && <span className="faint">Reading your posts…</span>}
      {!err && !busy && !shown && <span className="faint">Not enough data yet.</span>}
      {!err && !busy && shown && <Body name={name} metric={shown.metric} result={shown.result} />}
    </div>
  )
}

function Body(props: { name: string; metric: Metric | null; result: Result }) {
  const r = props.result
  if (r.kind === 'no-metrics') return <span className="faint">{props.name} does not report engagement to the app.</span>
  if (r.kind === 'not-enough') {
    return (
      <span className="faint">
        Not enough data yet for {props.name}: {r.have < r.need ? `${r.have} of ${r.need} posts` : `the posts fall in fewer than ${MIN_BUCKETS} different times (need ${MIN_POSTS} posts)`}.
      </span>
    )
  }
  const word = props.metric === 'views' ? 'views' : 'engagement'
  return (
    <div className="pc-best-list">
      {r.slots.map((s) => (
        <span key={`${s.weekday}${s.hour}`} className="faint">
          <b>{WEEKDAYS[s.weekday]} {hh(s.hour)}</b> · median {Math.round(s.median).toLocaleString('en-US')} {word} · {s.posts} post{s.posts === 1 ? '' : 's'}
        </span>
      ))}
      <span className="faint">Local time, from your own posts on {props.name}.</span>
    </div>
  )
}
