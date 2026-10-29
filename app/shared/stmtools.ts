// The stm tools an agent calls to act on the app (open panels, link them, start a loop, create a trigger):
// the values each one runs with after defaults, and the one line its approval card shows. Pure. The card
// always shows the cap, so the person sees what a yes can spend before giving it.

import { DEFAULT_CAP_USD, MAX_CAP_USD } from './provision.js'

export type PanelsOpen = { folder: string; persona?: string; goal?: string }
export type LinkSpec = { a: string; b: string; auto: boolean; capUsd?: number }
export type LoopSpec = { build: string; review: string; rounds: number; maxUsd: number }

const usd = (n: number) => `$${n.toFixed(2)}`
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** An auto link with no cap of its own gets the default one; a link that waits for the person needs none. */
export function linkSpec(i: { a: unknown; b: unknown; auto?: unknown; capUsd?: unknown }): LinkSpec {
  const a = str(i.a)
  const b = str(i.b)
  if (!a || !b) throw new Error('A link needs two panels.')
  if (a === b) throw new Error('A link must join two different panels.')
  const auto = i.auto === true
  let capUsd: number | undefined = i.capUsd === undefined || i.capUsd === null ? undefined : Number(i.capUsd)
  if (capUsd !== undefined && !(capUsd > 0 && capUsd <= MAX_CAP_USD)) throw new Error(`The link's cap must be above $0 and at most $${MAX_CAP_USD}.`)
  if (auto && capUsd === undefined) capUsd = DEFAULT_CAP_USD
  return { a, b, auto, ...(capUsd !== undefined ? { capUsd } : {}) }
}

export function loopSpec(i: { build: unknown; review: unknown; rounds?: unknown; maxUsd?: unknown }): LoopSpec {
  const build = str(i.build)
  const review = str(i.review)
  if (!build || !review) throw new Error('A review loop needs a build panel and a review panel.')
  if (build === review) throw new Error('The build and the review panel must be two different panels.')
  const rounds = i.rounds === undefined ? 3 : Math.round(Number(i.rounds))
  const maxUsd = i.maxUsd === undefined ? Math.min(2, DEFAULT_CAP_USD) : Number(i.maxUsd)
  if (!(rounds >= 1 && rounds <= 10)) throw new Error('Rounds: 1 to 10.')
  if (!(maxUsd > 0 && maxUsd <= MAX_CAP_USD)) throw new Error(`Spend cap: above $0 and at most $${MAX_CAP_USD}.`)
  return { build, review, rounds, maxUsd }
}

/** The approval card's line for one of these tools, or null for any other tool. */
export function cardSummary(tool: string, input: Record<string, unknown>): string | null {
  const name = /^mcp__stm__(\w+)$/.exec(tool)?.[1]
  try {
    if (name === 'panels_open') return `open a panel in ${str(input.folder) || '?'}${str(input.persona) ? ` as ${str(input.persona)}` : ''}${str(input.goal) ? `, goal: ${str(input.goal).slice(0, 80)}` : ''}. A panel spends only when it is asked to work`
    if (name === 'link') {
      const l = linkSpec({ a: input.a, b: input.b, auto: input.auto, capUsd: input.capUsd })
      return `link ${l.a} and ${l.b}, ${l.auto ? 'messages start on their own' : 'messages wait for you'}, ${l.capUsd !== undefined ? `cap ${usd(l.capUsd)} a day` : 'no cap'}`
    }
    if (name === 'loop_start') {
      const l = loopSpec({ build: input.build, review: input.review, rounds: input.rounds, maxUsd: input.maxUsd })
      return `review loop: ${l.build} builds, ${l.review} reviews, up to ${l.rounds} rounds, stops at ${usd(l.maxUsd)}`
    }
    if (name === 'trigger_create') return `trigger "${str(input.name).slice(0, 60)}" for ${str(input.panel) || '?'}, ${str(input.when) || '?'}; created turned off`
  } catch (e) {
    return `${name}: ${(e as Error).message}`
  }
  return null
}
