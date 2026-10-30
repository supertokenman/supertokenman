// Pack eval comparison (pure): one run with the pack and one without, compared on cost, time, turns, tokens
// and result. A winner is named only when both runs finished and the gap is at least 10 percent. One run
// per side is weak evidence, and the verdict says so.
import type { Attempt } from './fanout.js'

export type EvalSide = Attempt & {
  turns: number
  tokens: number // input + output + cache, from the usage counters
  ok: boolean // finished without an error
  capped: boolean // hit the turn cap
}

export type Delta = { abs: number; pct: number | null } // pct null when the base is 0

export type EvalComparison = {
  comparable: boolean
  flags: string[]
  sameResult: boolean
  deltas: { costUsd: Delta; ms: Delta; turns: Delta; tokens: Delta }
  verdict: string
  note: string
}

const THRESHOLD = 10
export const EVAL_NOTE = 'One run per side is weak evidence.'

const delta = (withV: number, withoutV: number): Delta => ({
  abs: withV - withoutV,
  pct: withoutV === 0 ? null : ((withV - withoutV) / withoutV) * 100,
})

const big = (d: Delta) => d.pct !== null && Math.abs(d.pct) >= THRESHOLD

/** What the run produced: tests when they ran, otherwise whether files changed. */
export function outcomeOf(s: EvalSide): string {
  if (s.tests) return s.tests.ok ? 'tests pass' : 'tests fail'
  return s.files > 0 ? 'changed files' : 'no changes'
}

export function comparePackEval(withPack: EvalSide, without: EvalSide): EvalComparison {
  const flags: string[] = []
  for (const [label, s] of [['With pack', withPack], ['Without pack', without]] as const) {
    if (!s.ok) flags.push(`${label}: run failed`)
    if (s.capped) flags.push(`${label}: hit the turn cap`)
    if (s.busy) flags.push(`${label}: still running`)
  }
  const deltas = {
    costUsd: delta(withPack.costUsd, without.costUsd),
    ms: delta(withPack.ms, without.ms),
    turns: delta(withPack.turns, without.turns),
    tokens: delta(withPack.tokens, without.tokens),
  }
  const sameResult = outcomeOf(withPack) === outcomeOf(without)
  const base = { flags, sameResult, deltas, note: EVAL_NOTE }

  if (flags.length) return { ...base, comparable: false, verdict: `Not comparable: ${flags.join('; ')}.` }
  if (!sameResult)
    return {
      ...base,
      comparable: true,
      verdict: `Different result: with pack ${outcomeOf(withPack)}, without ${outcomeOf(without)}. Cost and time not compared.`,
    }

  const parts: string[] = []
  if (big(deltas.costUsd)) parts.push(`${Math.round(Math.abs(deltas.costUsd.pct!))}% ${deltas.costUsd.abs < 0 ? 'cheaper' : 'pricier'}`)
  if (big(deltas.ms)) parts.push(`${Math.round(Math.abs(deltas.ms.pct!))}% ${deltas.ms.abs < 0 ? 'faster' : 'slower'}`)
  if (!parts.length) return { ...base, comparable: true, verdict: 'Too close to call: deltas under 10 percent, same result.' }
  return { ...base, comparable: true, verdict: `With pack: ${parts.join(', ')}, same result.` }
}
