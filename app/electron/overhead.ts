// What a panel sends with every turn before anyone types: the system prompt, the tool definitions
// (built in and from each MCP server), memory files (CLAUDE.md), skills and agents. Claude Code
// counts it; this turns its answer into rows the app can rank and price.
import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk'

export type Overhead = {
  model: string
  /** tokens paid on every turn, conversation aside */
  fixed: number
  rows: { id: string; name: string; tokens: number }[]
  servers: { name: string; tokens: number; tools: number; onDemand: boolean }[]
  memory: { path: string; tokens: number }[]
  /** built-in tools sent every turn, largest first */
  tools: { name: string; tokens: number }[]
  /** tool schemas kept out until searched for: free until used */
  deferred: number
}

/** The conversation, free space and compaction reserve are not overhead. */
const NOT_FIXED = new Set(['messages', 'free_space', 'autocompact_buffer', 'compact_buffer'])

export function toOverhead(c: SDKControlGetContextUsageResponse): Overhead {
  const rows = c.categories
    .filter((r) => r.kind === 'used' && !NOT_FIXED.has(r.id ?? '') && r.tokens > 0)
    .map((r) => ({ id: r.id ?? r.name, name: r.name, tokens: r.tokens }))
    .sort((a, b) => b.tokens - a.tokens)
  // a server's tools are either sent every turn or kept out until Claude searches for them
  const by = new Map<string, { tokens: number; tools: number; onDemand: boolean }>()
  for (const t of c.mcpTools ?? []) {
    const key = `${t.serverName}\0${t.isLoaded === false}`
    const s = by.get(key) ?? { tokens: 0, tools: 0, onDemand: t.isLoaded === false }
    by.set(key, { ...s, tokens: s.tokens + t.tokens, tools: s.tools + 1 })
  }
  return {
    model: c.model,
    fixed: rows.reduce((n, r) => n + r.tokens, 0),
    rows,
    servers: [...by].map(([key, s]) => ({ name: key.split('\0')[0]!, ...s })).sort((a, b) => Number(a.onDemand) - Number(b.onDemand) || b.tokens - a.tokens),
    memory: (c.memoryFiles ?? []).map((m) => ({ path: m.path, tokens: m.tokens })).sort((a, b) => b.tokens - a.tokens),
    tools: (c.systemTools ?? []).map((t) => ({ name: t.name, tokens: t.tokens })).sort((a, b) => b.tokens - a.tokens),
    deferred: c.categories.filter((r) => r.kind === 'deferred').reduce((n, r) => n + r.tokens, 0),
  }
}
