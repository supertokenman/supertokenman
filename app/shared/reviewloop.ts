// A review loop between two panels: the build panel's reply goes to the review panel, the review comes back,
// until the reviewer says APPROVED, the rounds run out or the spend cap is reached. Started by the person
// (window or their own terminal), never by an agent; each step goes through the usual brake and approvals.

export type Loop = { build: string; review: string; maxRounds: number; maxUsd: number; round: number; spentUsd: number; startedAt: number }
export type Step = { send: { to: string; text: string } } | { stop: string }

export const APPROVED = /^\s*\**\s*APPROVED\b/im

export function newLoop(build: string, review: string, maxRounds = 3, maxUsd = 2, now = Date.now()): Loop {
  if (build === review) throw new Error('The build and the review panel must be two different panels.')
  const rounds = Math.round(Number(maxRounds))
  const usd = Number(maxUsd)
  if (!(rounds >= 1 && rounds <= 10)) throw new Error('Rounds: 1 to 10.')
  if (!(usd > 0 && usd <= 50)) throw new Error('Spend cap: above $0 and at most $50.')
  return { build, review, maxRounds: rounds, maxUsd: usd, round: 0, spentUsd: 0, startedAt: now }
}

export const reviewAsk = (buildName: string, reply: string) =>
  `Review the work panel ${buildName} just reported. If it is done and correct, reply with APPROVED on the first line. Otherwise list what to fix, most important first, and nothing else.\n\n---\n\n${reply.trim()}`
export const fixAsk = (reviewName: string, review: string, round: number, of: number) =>
  `Review ${round} of ${of} from panel ${reviewName}. Fix these, run the checks, and report what changed:\n\n${review.trim()}`

/** What happens after a turn ends in one of the loop's panels. */
export function next(l: Loop, sid: string, reply: string, costUsd: number, names: { build: string; review: string }): { loop: Loop; step: Step } {
  const loop = { ...l, spentUsd: l.spentUsd + Math.max(0, costUsd) }
  if (sid !== loop.build && sid !== loop.review) return { loop: l, step: { stop: 'not in this loop' } }
  if (!reply.trim()) return { loop, step: { stop: 'The last turn gave no reply.' } }
  if (sid === loop.review) {
    const round = loop.round + 1
    if (APPROVED.test(reply)) return { loop: { ...loop, round }, step: { stop: `Approved by ${names.review} in round ${round}.` } }
    if (round >= loop.maxRounds) return { loop: { ...loop, round }, step: { stop: `Stopped after ${round} rounds without approval. The last review is in ${names.review}.` } }
    if (loop.spentUsd >= loop.maxUsd) return { loop: { ...loop, round }, step: { stop: `Stopped at the spend cap: $${loop.spentUsd.toFixed(2)} of $${loop.maxUsd.toFixed(2)}.` } }
    return { loop: { ...loop, round }, step: { send: { to: loop.build, text: fixAsk(names.review, reply, round, loop.maxRounds) } } }
  }
  if (loop.spentUsd >= loop.maxUsd) return { loop, step: { stop: `Stopped at the spend cap: $${loop.spentUsd.toFixed(2)} of $${loop.maxUsd.toFixed(2)}.` } }
  return { loop, step: { send: { to: loop.review, text: reviewAsk(names.build, reply) } } }
}
