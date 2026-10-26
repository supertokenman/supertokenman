// Model router: a suggestion, per message, of the model that fits it, with the reason and what it would
// save or cost. It never switches by itself: the person clicks. Idea from AgentScope's model router.
import { kindOf, presetOf, type Tally } from './arena.js'

export type Tier = 'haiku' | 'sonnet' | 'opus'
export const MODEL_OF: Record<Tier, string> = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }
export const LABEL: Record<Tier, string> = { haiku: 'Haiku 5.5', sonnet: 'Sonnet 5.5', opus: 'Opus 5.5' }
const RANK: Record<Tier, number> = { haiku: 0, sonnet: 1, opus: 2 }
/** US$ per million input tokens, for the estimate only (list prices; the plan may differ). */
export const PRICE_IN: Record<Tier, number> = { haiku: 1, sonnet: 3, opus: 5 }

export const tierOf = (model: string | null | undefined): Tier => (/haiku/i.test(model ?? '') ? 'haiku' : /opus/i.test(model ?? '') ? 'opus' : 'sonnet')

const HARD = /\b(architect\w*|system design|design (?:a|the) (?:system|schema|api)|trade-?offs?|migration plan|refactor (?:the|across|all)|race condition|deadlock|memory leak|security review|threat model|why is [^.?]{0,60} slow|concurren\w+|arquitetura|decis[aã]o de design)\b/i
const LIGHT = /\b(rename|typo|format(?:ting)?|lint|sort imports|add (?:a )?comment|commit message|changelog|translate|summari[sz]e|resum[aoi]|traduz\w*|reword|bump (?:the )?version|fix (?:the )?indent\w*)\b/i

export type Suggestion = { tier: Tier; why: string; costsMore: boolean; deltaUsd: number }

/**
 * The fitting model for this message, or null when the current one fits. contextTokens is what the
 * panel already carries: a switch saves or costs on all of it, each turn.
 */
export function suggest(prompt: string, current: Tier, contextTokens: number, tally: Tally = {}): Suggestion | null {
  const p = prompt.trim()
  if (p.length < 12) return null
  const kind = kindOf(p)
  let tier: Tier = 'sonnet'
  let why = 'everyday coding work'
  if (HARD.test(p) || p.length > 6000) {
    tier = 'opus'
    why = p.length > 6000 ? 'a long, involved request' : `${HARD.exec(p)![0].toLowerCase()}: worth the strongest model`
  } else if ((LIGHT.test(p) || ['summarize', 'translate', 'commit', 'classify'].includes(kind)) && p.length < 600) {
    // the arena's picks can veto: a kind where Claude clearly beat the local model stays on Sonnet
    if (presetOf(tally, kind) === 'claude' && kind !== 'other') return current === 'haiku' ? { tier: 'sonnet', why: `your picks in the arena favour the stronger model for ${kind}`, costsMore: true, deltaUsd: delta('haiku', 'sonnet', contextTokens) } : null
    tier = 'haiku'
    why = LIGHT.test(p) ? `${LIGHT.exec(p)![0].toLowerCase()}: a light task` : `a ${kind} task`
  }
  if (tier === current) return null
  return { tier, why, costsMore: RANK[tier] > RANK[current], deltaUsd: delta(current, tier, contextTokens) }
}

/** What the switch changes on one turn, input only: negative saves, positive costs. */
export const delta = (from: Tier, to: Tier, tokens: number) => ((PRICE_IN[to] - PRICE_IN[from]) * Math.max(tokens, 2000)) / 1_000_000
