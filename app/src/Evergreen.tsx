import { useEffect, useState } from 'react'
import { evergreenCandidates, MIN_AGE_DAYS, type EvergreenInput } from '../shared/evergreen'
import type { NetworkId, Post } from '../electron/social/core'

const NAMES: Partial<Record<NetworkId, string>> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', bluesky: 'Bluesky', mastodon: 'Mastodon' }

type Row = { net: NetworkId; post: Post; at: number }

// engagement is the sum of the counts the network reports; views are left out
const engagementOf = (p: Post): number | undefined => {
  const parts = [p.likes, p.comments, p.shares].filter((x): x is number => typeof x === 'number')
  return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined
}

/**
 * Evergreen: posts already sent, old enough, that did well on their network and have no dates or versions in
 * them. Lists them only; nothing is posted from here. Reads the posts the accounts already return.
 */
export function Evergreen() {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const nets = await window.stm.social.connected().catch(() => [] as NetworkId[])
      const now = Date.now()
      const per = await Promise.all(nets.map(async (net) => {
        const posts = await window.stm.social.posts(net).catch(() => [] as Post[])
        const byId = new Map(posts.map((p) => [p.id, p]))
        const input: EvergreenInput[] = posts
          .map((p) => ({ id: p.id, text: p.text, at: Date.parse(p.at), engagement: engagementOf(p) }))
          .filter((p) => Number.isFinite(p.at))
        return evergreenCandidates(input, now).map((c) => ({ net, post: byId.get(c.id)!, at: c.at }))
      }))
      if (live) setRows(per.flat())
    })()
    return () => { live = false }
  }, [])

  return (
    <section>
      <div className="chart-name">Evergreen</div>
      <div className="faint">
        Posts sent more than {MIN_AGE_DAYS} days ago that did well on their network and have no dates or version numbers in them.
        Nothing is posted from here.
      </div>
      {rows === null && <div className="faint">Reading your posts...</div>}
      {rows?.length === 0 && <div className="faint">Not enough data yet</div>}
      {rows?.map((r) => (
        <div key={`${r.net}:${r.post.id}`} className="faint">
          {NAMES[r.net] ?? r.net} · {new Date(r.at).toLocaleDateString()} · {r.post.text.slice(0, 160)}
          {' '}{r.post.url && <a href={r.post.url} target="_blank" rel="noreferrer">open</a>}
        </div>
      ))}
    </section>
  )
}
