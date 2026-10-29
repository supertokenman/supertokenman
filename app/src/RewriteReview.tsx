import { useState } from 'react'
import type { Net as NetId } from '../shared/social'
import { ACCOUNT_NAME as NET_NAME } from '../shared/accounts'
import { preview } from '../shared/posteverywhere'

/** One rewritten version for one network, as the rewrite step returns it. */
export type RewriteVersion = { net: NetId; text: string }

type Decision = 'open' | 'accepted' | 'rejected'
type Row = { text: string; editing: boolean; decision: Decision }

// Word-level diff by longest common subsequence. Too long to compare cheaply: no diff, the text still shows.
const DIFF_CELLS = 250_000
function wordDiff(from: string, to: string): { t: string; k: 'same' | 'del' | 'add' }[] | null {
  const A = from.split(/(\s+)/)
  const B = to.split(/(\s+)/)
  const n = A.length
  const m = B.length
  if (n * m > DIFF_CELLS) return null
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: { t: string; k: 'same' | 'del' | 'add' }[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: B[j], k: 'same' }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: A[i], k: 'del' }); i++ }
    else { out.push({ t: B[j], k: 'add' }); j++ }
  }
  while (i < n) out.push({ t: A[i++], k: 'del' })
  while (j < m) out.push({ t: B[j++], k: 'add' })
  return out
}

/**
 * Rewritten versions, one per network, next to the original. Each can be accepted, edited or rejected.
 * Every version shows its problem() check (the same preview() that Post everywhere uses) and cannot be
 * accepted while that check fails. The versions come in as props: the rewrite step itself is not wired yet.
 */
export function RewriteReview(props: {
  original: string
  versions: RewriteVersion[]
  title?: string
  mastodonLimit?: number
  onAccept: (net: NetId, text: string) => void
  onReject: (net: NetId) => void
}) {
  // rows are keyed by network; the parent passes a new key when it has new versions
  const [rows, setRows] = useState<Partial<Record<NetId, Row>>>(() =>
    Object.fromEntries(props.versions.map((v) => [v.net, { text: v.text, editing: false, decision: 'open' as Decision }])) as Partial<Record<NetId, Row>>)
  const patch = (net: NetId, p: Partial<Row>) => setRows((r) => ({ ...r, [net]: { ...r[net]!, ...p } }))
  if (!props.versions.length) return <div className="faint">No rewrites to review.</div>
  return (
    <section className="rw-review" aria-label="Rewrites per network" style={{ display: 'grid', gap: 12 }}>
      <div className="chart-name">Rewrites per network</div>
      {props.versions.map((v) => {
        const row = rows[v.net]
        if (!row) return null
        const limit = v.net === 'mastodon' && props.mastodonLimit ? props.mastodonLimit : undefined
        const p = preview(v.net, row.text, props.title ?? '', limit)
        const diff = wordDiff(props.original, row.text)
        return (
          <article key={v.net} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <b>{NET_NAME[v.net]}</b>
              <span className="faint">{p.count}{p.limit !== null ? ` / ${p.limit}` : ''} characters</span>
              <span className="faint">{row.decision === 'accepted' ? 'Accepted' : row.decision === 'rejected' ? 'Rejected' : ''}</span>
            </div>
            {row.editing
              ? <textarea aria-label={`Edit ${NET_NAME[v.net]} version`} rows={5} value={row.text} onChange={(e) => patch(v.net, { text: e.target.value, decision: 'open' })} />
              : diff
                ? <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{diff.map((d, k) => d.k === 'same' ? <span key={k}>{d.t}</span> : d.k === 'del' ? <del key={k} className="faint">{d.t}</del> : <ins key={k}>{d.t}</ins>)}</p>
                : <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{row.text}</p>}
            <div className={p.ok ? 'faint' : 'error'}>{p.ok ? 'Passes the check for this network.' : p.problem}</div>
            <div className="ob-row" style={{ display: 'flex', gap: 8 }}>
              <button className="primary" disabled={!p.ok || row.decision === 'accepted'} onClick={() => { patch(v.net, { decision: 'accepted', editing: false }); props.onAccept(v.net, row.text) }}>Accept</button>
              <button className="ghost" onClick={() => patch(v.net, { editing: !row.editing })}>{row.editing ? 'Done editing' : 'Edit'}</button>
              <button className="ghost" disabled={row.decision === 'rejected'} onClick={() => { patch(v.net, { decision: 'rejected', editing: false }); props.onReject(v.net) }}>Reject</button>
            </div>
          </article>
        )
      })}
    </section>
  )
}
