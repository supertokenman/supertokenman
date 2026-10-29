// Between "the agent wrote a team bundle from a spec" and "the person approves it once": validates the bundle,
// adds the optional review loop and the spend cap, and builds the preview the person sees. Pure; creates nothing.

import { parseBundle, reviewLines, type Team } from './teambundle.js'

export type Provision = { team: Team; loop?: { build: string; review: string; rounds: number; maxUsd: number }; capUsd: number }

export const DEFAULT_CAP_USD = 5
export const MAX_CAP_USD = 50
export const MAX_PANELS = 8

const DEFAULT_ROUNDS = 3
const MAX_ROUNDS = 10

const money = (n: number) => `$${n.toFixed(2)}`

export function planFromBundle(
  md: string,
  opts: { loop?: { build: string; review: string; rounds?: number; maxUsd?: number }; capUsd?: number } = {},
): Provision {
  const team = parseBundle(md)
  if (team.panels.length > MAX_PANELS) throw new Error(`A team can start with at most ${MAX_PANELS} panels.`)

  const capUsd = opts.capUsd ?? DEFAULT_CAP_USD
  if (!(capUsd > 0 && capUsd <= MAX_CAP_USD)) throw new Error(`The spend cap must be above $0 and at most $${MAX_CAP_USD}.`)

  if (!opts.loop) return { team, capUsd }

  const { build, review } = opts.loop
  const names = new Set(team.panels.map((p: Team['panels'][number]) => p.name))
  if (!names.has(build) || !names.has(review)) throw new Error('The review loop must name panels that are in the team.')
  if (build === review) throw new Error('The review loop needs two different panels, one to build and one to review.')

  const rounds = opts.loop.rounds ?? DEFAULT_ROUNDS
  if (!(Number.isInteger(rounds) && rounds >= 1 && rounds <= MAX_ROUNDS)) throw new Error(`The review loop runs 1 to ${MAX_ROUNDS} rounds.`)

  const maxUsd = opts.loop.maxUsd ?? Math.min(2, capUsd)
  if (!(maxUsd > 0 && maxUsd <= capUsd)) throw new Error(`The loop's spend cap must be above $0 and no more than the team's cap of ${money(capUsd)}.`)

  return { team, loop: { build, review, rounds, maxUsd }, capUsd }
}

export function previewLines(p: Provision): string[] {
  const out = reviewLines(p.team)
  if (p.loop) {
    out.push(`Review loop: ${p.loop.build} builds, ${p.loop.review} reviews, up to ${p.loop.rounds} rounds, stops at ${money(p.loop.maxUsd)}`)
  }
  out.push(`Spend cap for this team: ${money(p.capUsd)}. Nothing is created until you press Create.`)
  return out
}

export function summaryForAgent(p: Provision): string {
  const panels = p.team.panels.length
  const links = p.team.links.length
  const triggers = p.team.triggers.length
  const loop = p.loop
    ? `A review loop is set (${p.loop.rounds} rounds, stops at ${money(p.loop.maxUsd)}).`
    : 'No review loop is set.'
  const text =
    `Team plan ready: ${panels} panels, ${links} links, ${triggers} triggers (triggers come in turned off). ` +
    `${loop} Spend cap for the team: ${money(p.capUsd)}. ` +
    'Nothing is created until the person reviews this plan and approves it.'
  return text.length <= 400 ? text : text.slice(0, 399) + '…'
}
