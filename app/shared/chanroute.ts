// Mention routing for team channel posts: which panels a post wakes, and whether each wake is queued, sent automatically, or refused.
// Pure logic only. The link rule copies electron/panelbus.ts (deliveryOf, linkKey); depth and caps come from teambus.ts.
import { MAX_DEPTH, MAX_OPEN_PER_PANEL, wouldLoop, type Ask } from './teambus.js'

export type Wake = { post: string; to: string; delivery: 'queued' | 'auto' | 'refused'; why?: string }
/** `from` is a panel id or 'you'; `depth` is 0 for the person's posts and depth+1 for posts made in a wake turn. */
export type RoutePost = { id: string; from: string; text: string; mentions: string[]; depth: number }
export type RouteLink = { a: string; b: string; auto?: boolean; capUsd?: number; spent?: { usd: number } }
/** `sendLeft`: auto sends still allowed under `sendLimit` for this route call. */
export type RouteLimits = { sendLeft: number }
/** Open wakes: `from` is the poster, `to` the panel woken. */
export type OpenWake = { from: string; to: string }

export const PERSON = 'you'

const MENTION = /(^|[^\w@.])@([\w-]+(?:\.[\w-]+)*)/g

/** The distinct known panel names mentioned as @name in `text`, in order of first mention. Unknown names are ignored. */
export function parseMentions(text: string, panels: string[]): string[] {
  const known = new Set(panels)
  const out: string[] = []
  for (const m of text.matchAll(MENTION)) {
    const name = m[2]!
    if (known.has(name) && !out.includes(name)) out.push(name)
  }
  return out
}

const linked = (links: RouteLink[], x: string, y: string) =>
  links.find((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x))

/** One wake per distinct mentioned panel. Self-mentions produce no wake. Auto is downgraded to queued when a send or link cap blocks it. */
export function route(post: RoutePost, links: RouteLink[], open: OpenWake[], limits: RouteLimits): Wake[] {
  const wakes: Wake[] = []
  const openTo = new Map<string, number>()
  for (const o of open) openTo.set(o.to, (openTo.get(o.to) ?? 0) + 1)
  const seen = new Set<string>()
  let sendLeft = limits.sendLeft
  const refuse = (to: string, why: string) => wakes.push({ post: post.id, to, delivery: 'refused', why })

  for (const to of post.mentions) {
    if (to === post.from || seen.has(to)) continue
    seen.add(to)
    if (post.depth > MAX_DEPTH) { refuse(to, 'Too many hand-offs: panels asked each other more than 2 deep.'); continue }
    const n = openTo.get(to) ?? 0
    if (n >= MAX_OPEN_PER_PANEL) { refuse(to, `${to} already has ${n} open wakes. Wait for an answer first.`); continue }

    if (post.from === PERSON) { wakes.push({ post: post.id, to, delivery: 'queued' }); continue }
    const link = linked(links, post.from, to)
    if (!link) { refuse(to, `${post.from} is not linked to ${to}.`); continue }
    if (link.auto !== true) { wakes.push({ post: post.id, to, delivery: 'queued' }); continue }

    // Auto: the loop check is a hard refusal; spend limits only downgrade to queued, so nothing is sent unattended.
    const asks = open.map((o): Ask => ({ id: '', from: o.from, to: o.to, question: '', depth: 0, at: 0 }))
    if (wouldLoop(asks, post.from, to)) { refuse(to, `Sending to ${to} would close a loop.`); continue }
    if (sendLeft <= 0) { wakes.push({ post: post.id, to, delivery: 'queued', why: 'Send limit reached: queued for you to send.' }); continue }
    if (link.capUsd !== undefined && (link.spent?.usd ?? 0) >= link.capUsd) {
      wakes.push({ post: post.id, to, delivery: 'queued', why: 'Link cap reached: queued for you to send.' }); continue
    }
    sendLeft -= 1
    wakes.push({ post: post.id, to, delivery: 'auto' })
  }
  return wakes
}
