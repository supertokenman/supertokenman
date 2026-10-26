// The arena: one prompt answered by the local model and by Claude side by side, the person picks the
// better one. The picks add up per kind of task, and a kind with a clear winner becomes a preset: small
// tasks of that kind go straight to the winner.

export type Kind = 'summarize' | 'translate' | 'commit' | 'reply' | 'explain' | 'code' | 'classify' | 'other'
export type Tally = Partial<Record<Kind, { local: number; claude: number; tie: number }>>
export type Winner = 'local' | 'claude' | 'tie'

const KINDS: [Kind, RegExp][] = [
  ['commit', /\bcommit message|mensagem de commit\b/i],
  ['translate', /\btranslat|\btraduz|\btradu[cç]/i],
  ['summarize', /\bsummar|\bresum|\btl;?dr\b|\bshort version\b/i],
  ['reply', /\breply|\brespond|\bresponda|\bresposta\b/i],
  ['classify', /\bclassif|\bwhich (?:one|persona|category)|\bqual (?:persona|categoria)|\bpick one\b|\breply with (?:one|the id)/i],
  ['code', /```|\bfunction\b|\bregex\b|\bsql\b|\bscript\b|\bc[oó]digo\b|\bcode\b/i],
  ['explain', /\bexplain|\bexplique|\bexplica|\bwhat is\b|\bo que [eé]\b|\bwhy\b|\bpor ?que\b/i],
]

export function kindOf(prompt: string): Kind {
  const head = prompt.slice(0, 600)
  return KINDS.find(([, re]) => re.test(head))?.[0] ?? 'other'
}

export function vote(t: Tally, kind: Kind, w: Winner): Tally {
  const cur = t[kind] ?? { local: 0, claude: 0, tie: 0 }
  return { ...t, [kind]: { ...cur, [w]: cur[w] + 1 } }
}

/**
 * The preset a kind earned: 'local' when the local model won or tied in at least 3 picks and two
 * thirds of them; 'claude' when Claude won two thirds of at least 3; none otherwise.
 */
export function presetOf(t: Tally, kind: Kind): 'local' | 'claude' | null {
  const c = t[kind]
  if (!c) return null
  const n = c.local + c.claude + c.tie
  if (n < 3) return null
  if ((c.local + c.tie) / n >= 2 / 3 && c.local >= 1) return 'local'
  if (c.claude / n >= 2 / 3) return 'claude'
  return null
}

/** Where a small task went and why: the log behind the Local or Claude column. */
export type Choice = { at: number; kind: Kind; where: 'local' | 'claude'; why: 'preset' | 'model' | 'fallback' | 'no-model' | 'claude-down' | 'deferred'; ms: number; note?: string }
export const addChoice = (list: Choice[], c: Choice, keep = 100) => [c, ...list].slice(0, keep)
