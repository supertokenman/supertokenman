// Pruning MCP tools for a task (phase 87): of the tools the installed servers offer, the few a task
// likely needs, by words in common with each tool's name and description. Pruning only takes tools
// away from a panel, never grants one; the person confirms, and can put them all back.
import { bm25 } from './research.js'

export type ToolInfo = { server: string; name: string; description: string; tokens: number }
export const qualified = (t: Pick<ToolInfo, 'server' | 'name'>) => `mcp__${t.server}__${t.name}`

/** Tools kept whatever the task: the app's own memory and panel tools. */
export const ALWAYS = /^mcp__(?:mem|panels|stm)__/

/**
 * The tools to keep for a task: every tool whose words match, best first, at least `min` and at most
 * `max`, plus whole servers the task names ("use github"), plus ALWAYS.
 */
export function keepFor(task: string, tools: ToolInfo[], opts: { min?: number; max?: number } = {}): Set<string> {
  const min = opts.min ?? 3
  const max = opts.max ?? 12
  const keep = new Set(tools.map(qualified).filter((q) => ALWAYS.test(q)))
  const t = task.toLowerCase()
  for (const s of new Set(tools.map((x) => x.server))) if (new RegExp(`\\b${s.replace(/[^\w]/g, '.?')}\\b`, 'i').test(t)) tools.filter((x) => x.server === s).forEach((x) => keep.add(qualified(x)))
  const docs = tools.map((x) => `${x.name.replace(/[_-]/g, ' ')} ${x.server} ${x.description}`)
  const scores = bm25(task, docs)
  const ranked = tools.map((x, i) => [qualified(x), scores[i]!] as const).sort((a, b) => b[1] - a[1])
  let added = 0
  for (const [q, s] of ranked) {
    if (added >= max) break
    if (s <= 0 && added >= min) break
    if (s <= 0 && added < min && ranked[0]![1] <= 0) break
    if (!keep.has(q)) (keep.add(q), added++)
  }
  return keep
}

/** What a pruning saves: tools left out and their schema tokens on every turn. */
export function savings(tools: ToolInfo[], keep: Set<string>): { off: string[]; tokens: number } {
  const off = tools.filter((x) => !keep.has(qualified(x)))
  return { off: off.map(qualified), tokens: off.reduce((n, x) => n + x.tokens, 0) }
}
