// One list of what needs you, from every corner of the app, ranked: what blocks work first, what can
// wait last. Built from state the app already holds; nothing here fetches.
import type { Panels } from './state'

export type Need = {
  id: string
  /** 0 blocks you now, 1 soon, 2 when you can */
  level: 0 | 1 | 2
  kind: 'ask' | 'ci' | 'meeting' | 'review' | 'team' | 'message' | 'secret' | 'renewal' | 'news' | 'done' | 'update' | 'cloud'
  title: string
  detail?: string
  at?: number
  /** what clicking does, read by the sheet */
  go: { to: 'panel'; sid: string } | { to: 'agenda' } | { to: 'prs' } | { to: 'team' } | { to: 'app'; app: string } | { to: 'connections' } | { to: 'spend' } | { to: 'news' } | { to: 'join'; url: string } | { to: 'update' } | { to: 'cloud' }
}

export type Inputs = {
  panels: Panels
  appUnread: Record<string, number>
  appNames: Record<string, string>
  teamUnread: number
  reviews: { repo: string; number: number; title: string }[]
  next: { title: string; inMin: number; join?: string } | null
  exposures: number
  renewals: { name: string; inDays: number }[]
  newsUnread: number
  /** commits waiting in the checkout the app was built from */
  update?: { behind: number; subjects: string[] }
  /** the runtime state of each panel (panel:state), when main reports it */
  runs?: Record<string, { state: string; reason?: string }>
  /** cloud resources running two weeks or more */
  forgotten?: { name: string; provider: string; days: number }[]
  now: number
}

const folder = (cwd: string) => cwd.split('/').filter(Boolean).at(-1) ?? cwd

export function needs(i: Inputs): Need[] {
  const out: Need[] = []
  for (const sid of i.panels.order) {
    const s = i.panels.byId[sid]
    if (!s) continue
    // a panel waiting for your yes is the one thing that stops work
    for (const a of s.asks) out.push({ id: `ask-${sid}-${a.id}`, level: 0, kind: 'ask', title: `${folder(s.cwd)} waits for you`, detail: `${a.tool}: ${a.summary}`.slice(0, 120), go: { to: 'panel', sid } })
    // a panel that asked a question in words, or stopped, blocks you too (an approval is already above)
    const r = i.runs?.[sid]
    if (r?.state === 'waiting_input') out.push({ id: `input-${sid}`, level: 0, kind: 'ask', title: `${folder(s.cwd)} asks you something`, go: { to: 'panel', sid } })
    if (r?.state === 'error') out.push({ id: `error-${sid}`, level: 0, kind: 'ask', title: `${folder(s.cwd)} stopped`, detail: r.reason?.slice(0, 120), go: { to: 'panel', sid } })
    const run = s.ci?.runs[0]
    if (run?.conclusion === 'failure') out.push({ id: `ci-${sid}-${run.id}`, level: 0, kind: 'ci', title: `CI failed on ${s.ci!.branch}`, detail: `${s.ci!.repo} · ${run.workflow}`, at: Date.parse(run.updatedAt), go: { to: 'panel', sid } })
    // a finished answer in a panel you are not looking at
    if (!s.busy && sid !== i.panels.focus && s.lastTurnAt && i.now - s.lastTurnAt < 30 * 60_000 && s.lines.at(-1)?.kind === 'assistant')
      out.push({ id: `done-${sid}-${s.lastTurnAt}`, level: 2, kind: 'done', title: `${folder(s.cwd)} finished`, detail: (s.lines.at(-1) as { text: string }).text.split('\n')[0]!.slice(0, 100), at: s.lastTurnAt, go: { to: 'panel', sid } })
  }
  if (i.next && i.next.inMin <= 15)
    out.push({ id: `meet-${i.next.title}`, level: i.next.inMin <= 5 ? 0 : 1, kind: 'meeting', title: i.next.inMin <= 0 ? `${i.next.title} is on` : `${i.next.title} in ${i.next.inMin} min`, go: i.next.join ? { to: 'join', url: i.next.join } : { to: 'agenda' } })
  if (i.exposures) out.push({ id: 'secrets', level: 0, kind: 'secret', title: `${i.exposures} credential${i.exposures > 1 ? 's' : ''} exposed in chat`, detail: 'Rotate them and keep them in the vault', go: { to: 'connections' } })
  for (const r of i.reviews.slice(0, 5)) out.push({ id: `pr-${r.repo}-${r.number}`, level: 1, kind: 'review', title: `Review: ${r.title}`, detail: `${r.repo} #${r.number}`, go: { to: 'prs' } })
  if (i.teamUnread) out.push({ id: 'team', level: 1, kind: 'team', title: `${i.teamUnread} new in the team room`, go: { to: 'team' } })
  for (const [app, n] of Object.entries(i.appUnread)) if (n > 0) out.push({ id: `app-${app}`, level: 1, kind: 'message', title: `${n} unread in ${i.appNames[app] ?? app}`, go: { to: 'app', app } })
  for (const r of i.renewals) if (r.inDays <= 7) out.push({ id: `renew-${r.name}`, level: r.inDays <= 2 ? 1 : 2, kind: 'renewal', title: `${r.name} renews ${r.inDays <= 0 ? 'today' : `in ${r.inDays}d`}`, go: { to: 'spend' } })
  const old = i.forgotten ?? []
  if (old.length) out.push({ id: 'cloud', level: 1, kind: 'cloud', title: old.length === 1 ? `${old[0]!.name} running for ${old[0]!.days} days` : `${old.length} cloud machines running 2+ weeks`, detail: old.map((o) => `${o.provider}: ${o.name}`).join(', ').slice(0, 120), go: { to: 'cloud' } })
  if (i.update?.behind) out.push({ id: 'update', level: 2, kind: 'update', title: `Update: ${i.update.behind} new change${i.update.behind > 1 ? 's' : ''}`, detail: i.update.subjects[0], go: { to: 'update' } })
  if (i.newsUnread) out.push({ id: 'news', level: 2, kind: 'news', title: `${i.newsUnread} stories`, go: { to: 'news' } })
  return out.sort((a, b) => a.level - b.level || (b.at ?? 0) - (a.at ?? 0))
}
