// The catalog as text for the agent (`app_commands`): one line per runnable command, grouped, under a
// token budget. Pure. Commands with `agent: false` are left out: the agent cannot run them.
import type { CommandSpec } from './pilotcatalog.js'

export const SUMMARY_BUDGET_TOKENS = 2000

/** A rough token count: about four characters per token. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export type Summary = { text: string; groups: string[]; count: number; truncated: boolean; tokens: number }

/** One line: `- id: title [tier] (args)`; args are the names, with the enum values for enums. */
export function line(c: CommandSpec): string {
  const args = Object.entries(c.args).map(([k, d]) => (d.type === 'enum' ? `${k}=${(d.values ?? []).join('|')}` : `${k}:${d.type}`))
  return `- ${c.id}: ${c.title} [${c.tier}]${args.length ? ` (${args.join(', ')})` : ''}`
}

/**
 * Groups the runnable commands and renders them within `budgetTokens`. When the budget runs out the list
 * stops, and a last line says how many more there are and how to narrow it (`group`).
 */
export function summarize(commands: readonly CommandSpec[], opts: { group?: string; budgetTokens?: number } = {}): Summary {
  const budget = opts.budgetTokens ?? SUMMARY_BUDGET_TOKENS
  const want = opts.group?.toLowerCase()
  const runnable = commands.filter((c) => c.agent && (!want || c.group.toLowerCase() === want))
  const groups = [...new Set(runnable.map((c) => c.group))]
  const out: string[] = []
  let used = 0
  let shown = 0
  let heading = ''
  for (const c of runnable) {
    const h = c.group !== heading ? `## ${c.group}` : ''
    const add = [...(h ? [h] : []), line(c)].join('\n')
    const cost = estimateTokens(add) + 1
    const note = `… ${runnable.length - shown} more, narrow with group (${groups.join(', ')})`
    if (used + cost + estimateTokens(note) > budget) {
      out.push(note)
      const text = out.join('\n')
      return { text, groups, count: shown, truncated: true, tokens: estimateTokens(text) }
    }
    out.push(add)
    used += cost
    shown++
    heading = c.group
  }
  const text = out.join('\n')
  return { text, groups, count: shown, truncated: false, tokens: estimateTokens(text) }
}
