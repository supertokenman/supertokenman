// Pilot permission tiers: which tier a catalog command runs at, what the policy gate decides for it, and
// which tool calls taint a session. Pure: no fs, no electron. Used with electron/policy.ts (gate) and
// electron/session.ts (taint), which pass the results in; nothing the agent sends chooses a tier.
import type { Decision } from './policygate.js'
import type { CommandSpec, Tier } from './pilotcatalog.js'

/** Setting keys whose change widens what the app or agent may do. A change to one always asks. */
export const WIDENING_KEYS: readonly string[] = ['mcpSend', 'phone', 'integrations', 'providers', 'dbConns', 'triggers', 'personas', 'budget']

/**
 * The tier of one call: the spec's tier, raised to `confirm` for an irreversible command or a change to a
 * widening setting key. Never lowered, and never taken from the agent's own input beyond the args.
 */
export function resolveTier(spec: CommandSpec, ctx: { args: Record<string, unknown> }): Tier {
  let tier = spec.tier
  if (spec.effect === 'irreversible') tier = 'confirm'
  const key = ctx.args.key
  if (typeof key === 'string' && WIDENING_KEYS.includes(key)) tier = 'confirm'
  return tier
}

/**
 * The gate's decision for a tier. `free` allows. `confirm` always asks: no rule can allow it. `ask` asks
 * unless a policy allow rule matches and the session is clean (not tainted).
 */
export function toDecision(tier: Tier, ctx: { tainted: boolean; ruleAllows: boolean }): Decision {
  if (tier === 'free') return 'allow'
  if (tier === 'confirm') return 'ask'
  return ctx.ruleAllows && !ctx.tainted ? 'allow' : 'ask'
}

/** Tools whose results are untrusted content: files, the web, other panels' channel messages, non-stm MCP servers. */
const UNTRUSTED_TOOLS = new Set(['Read', 'Grep', 'WebFetch', 'WebSearch', 'mcp__stm__channel_read', 'mcp__stm__channel_mentions'])

/** True when a tool's result is untrusted content, so the whole session is tainted after it. */
export function taintedAfter(toolName: string): boolean {
  if (UNTRUSTED_TOOLS.has(toolName)) return true
  const m = /^mcp__(.+?)__/.exec(toolName)
  return m !== null && m[1] !== 'stm'
}
