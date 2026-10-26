// Autonomy: what a persona may run without asking. Supervised (the default) asks for every command
// as Claude Code does and refuses the dangerous ones outright; Trusted runs safe commands on its own.
// Dangerous commands are refused at every level: the person runs those themselves.

import { riskOf, type Risk } from './cmdrisk.js'

export type Autonomy = 'supervised' | 'trusted'
export const AUTONOMY: Record<Autonomy, { label: string; what: string }> = {
  supervised: { label: 'Supervised', what: 'Asks before every command; refuses dangerous ones.' },
  trusted: { label: 'Trusted', what: 'Runs safe commands (tests, builds, reads) without asking; asks for the rest; refuses dangerous ones.' },
}

const SHELL_TOOLS = new Set(['Bash', 'BashOutput'])

/** The command a shell tool call runs, if it is one. */
export const commandOf = (tool: string, input: Record<string, unknown>) => (SHELL_TOOLS.has(tool) && typeof input.command === 'string' ? input.command : null)

/** What the app does with a tool call before asking: refuse it, let it run, or ask as usual. */
export function decide(level: Autonomy, tool: string, input: Record<string, unknown>): { action: 'deny' | 'allow' | 'ask'; risk: Risk | null; reason?: string } {
  const cmd = commandOf(tool, input)
  if (cmd === null) return { action: 'ask', risk: null }
  const risk = riskOf(cmd)
  if (risk.level === 'blocked') return { action: 'deny', risk, reason: `The app refused this command because it ${risk.why}. If it is really needed, tell the person the exact command and why, and let them run it themselves.` }
  if (level === 'trusted' && risk.level === 'safe') return { action: 'allow', risk }
  return { action: 'ask', risk }
}

/** How sure the app is that outside text tries to give orders: 0 to 100, and No, Maybe or Yes. */
export function injectionScore(found: { severity: 'low' | 'medium' | 'high'; rule: string }[]): { score: number; label: 'No' | 'Maybe' | 'Yes' } {
  const base = { high: 85, medium: 60, low: 35 }
  const rules = found.filter((f) => !f.rule.includes('(local model)'))
  const model = found.some((f) => f.rule.includes('(local model)'))
  let score = rules.reduce((m, f) => Math.max(m, base[f.severity]), 0)
  // each extra rule and the local model's yes add to it; they agree from different angles
  score += Math.max(0, rules.length - 1) * 5
  if (model) score = score ? score + 15 : 55
  score = Math.min(100, score)
  return { score, label: score >= 70 ? 'Yes' : score >= 30 ? 'Maybe' : 'No' }
}
