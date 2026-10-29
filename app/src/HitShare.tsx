import { useEffect, useState } from 'react'
import type { NetworkId } from '../electron/social/core'
import { HIT_MIN_POSTS, HIT_WINDOW, hitShare, type HitShare as Result } from '../shared/hitshare'
import { clean } from './errors'
import './bridge'

const NAMES: Record<NetworkId, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', bluesky: 'Bluesky', mastodon: 'Mastodon' }
const pct = (v: number) => `${Math.round(v * 100)}%`

type Row = { net: NetworkId; result: Result | null; err?: string }

/**
 * Hit share: how much of the recent total on each connected network comes from its top post. Computed on
 * this device from the posts the network reports for your own account; read only when you click.
 */
export function HitShare() {
  const [nets, setNets] = useState<NetworkId[] | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => void window.stm.social.connected().then(setNets, () => setNets([])), [])
  const read = () => {
    if (!nets) return
    setBusy(true)
    void Promise.all(nets.map(async (net): Promise<Row> => {
      try {
        const list = await window.stm.social.posts(net)
        return { net, result: hitShare(list.map((p) => ({ at: Date.parse(p.at), likes: p.likes, comments: p.comments, shares: p.shares, views: p.views }))) }
      } catch (e) {
        return { net, result: null, err: clean(e) }
      }
    })).then(setRows).finally(() => setBusy(false))
  }
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div className="chart-name">Hit share</div>
      <div className="faint">The share of the last {HIT_WINDOW} posts' total that comes from the top post and the top three. A reference point, not a target. Needs {HIT_MIN_POSTS} posts with counts.</div>
      <div className="ob-row">
        <button className="ghost small" disabled={busy || !nets?.length} onClick={read}>{busy ? 'Reading…' : 'Read my recent posts'}</button>
        {nets && !nets.length && <span className="faint">Connect an account first.</span>}
        {nets?.length ? <span className="faint">One request per connected network, only when you click.</span> : null}
      </div>
      {rows?.map((r) => (
        <div key={r.net} className="ob-row">
          <span style={{ minWidth: 100 }}>{NAMES[r.net]}</span>
          {r.err ? <span className="error">{r.err}</span>
            : r.result?.kind === 'ok' ? <span>Top post {pct(r.result.top)} · top three {pct(r.result.top3)} · {r.result.posts} posts, by {r.result.metric}</span>
            : <span className="faint">Not enough data yet</span>}
        </div>
      ))}
      <div className="faint">Shares come from your own measured posts only.</div>
    </section>
  )
}
