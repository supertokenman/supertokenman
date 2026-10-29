import { useEffect, useState } from 'react'
import { evergreenCandidates, MIN_AGE_DAYS, type EvergreenInput } from '../shared/evergreen'
import type { NetworkId, Post } from '../electron/social/core'
import { clean } from './errors'

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
  // one reworded text per post, asked for only when its button is clicked
  const [words, setWords] = useState<Record<string, { text?: string; busy?: boolean; err?: string; saved?: boolean }>>({})
  const setW = (k: string, w: { text?: string; busy?: boolean; err?: string; saved?: boolean }) => setWords((x) => ({ ...x, [k]: w }))
  const reword = (r: Row) => {
    const k = `${r.net}:${r.post.id}`
    setW(k, { busy: true })
    window.stm.social.reword(r.post.text, r.net).then((o) => setW(k, { text: o.text }), (e) => setW(k, { err: clean(e) }))
  }
  const draft = (r: Row, text: string) => {
    const k = `${r.net}:${r.post.id}`
    window.stm.social.save({ text, networks: [r.net] }).then(() => setW(k, { text, saved: true }), (e) => setW(k, { text, err: clean(e) }))
  }
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
        Rewording asks the small model only when you click it; a saved draft stays unapproved.
      </div>
      {rows === null && <div className="faint">Reading your posts...</div>}
      {rows?.length === 0 && <div className="faint">Not enough data yet</div>}
      {rows?.map((r) => {
        const k = `${r.net}:${r.post.id}`
        const w = words[k]
        return (
          <div key={k} style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            <div className="faint">
              {NAMES[r.net] ?? r.net} · {new Date(r.at).toLocaleDateString()} · {r.post.text.slice(0, 160)}
              {' '}{r.post.url && <a href={r.post.url} target="_blank" rel="noreferrer">open</a>}
            </div>
            <div className="ob-row">
              <button className="ghost small" disabled={w?.busy} data-tip="One request to the small model, only when you click" onClick={() => reword(r)}>{w?.busy ? 'Rewording…' : 'Reword'}</button>
              {w?.text && !w.saved && <button className="ghost small" onClick={() => draft(r, w.text!)}>Save as draft</button>}
              {w?.saved && <span className="faint">Saved as an unapproved draft. Nothing is posted.</span>}
            </div>
            {w?.text && <div>{w.text}</div>}
            {w?.err && <div className="error">{w.err}</div>}
          </div>
        )
      })}
    </section>
  )
}
