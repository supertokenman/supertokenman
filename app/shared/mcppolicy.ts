// Approval by tool class for MCP servers you installed: a read runs without a card, a write waits for
// Approve, per server and per persona, with a rule for one tool that wins over both. A tool's class comes
// from what the inspector learned (its annotations) or, failing that, from its name.

import { classOf } from './mcpinspect.js'

export type Mode = 'reads' | 'ask' | 'all' | 'off'
export type ToolRule = 'allow' | 'ask' | 'deny'
export type Policy = {
  /** what a server you have not set gets */
  default: Mode
  servers: Record<string, Mode>
  /** per persona, per server; wins over the server's mode */
  personas: Record<string, Record<string, Mode>>
  /** "server/tool": wins over everything */
  tools: Record<string, ToolRule>
  /** what the inspector read from each server: tool name to class */
  learned: Record<string, Record<string, 'read' | 'write'>>
}
export const emptyPolicy = (): Policy => ({ default: 'reads', servers: {}, personas: {}, tools: {}, learned: {} })

export const MODES: Record<Mode, string> = { reads: 'Reads run, writes ask', ask: 'Every call asks', all: 'Every call runs', off: 'Turned off' }

/** "mcp__github__create_issue" to server and tool; null for anything that is not an MCP tool. */
export function splitTool(name: string): { server: string; tool: string } | null {
  const m = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name)
  return m ? { server: m[1]!, tool: m[2]! } : null
}

export type Verdict = { action: 'allow' | 'ask' | 'deny'; cls: 'read' | 'write'; why: string }

/**
 * The verdict for one call. `known` are the servers installed in Claude Code; the app's own in-process
 * servers are not in it and are left to the usual rules (the caller passes them through).
 */
export function verdict(p: Policy, name: string, persona: string | undefined): Verdict | null {
  const s = splitTool(name)
  if (!s) return null
  const cls = p.learned[s.server]?.[s.tool] ?? classOf({ name: s.tool })
  const rule = p.tools[`${s.server}/${s.tool}`]
  if (rule) return { action: rule, cls, why: `your rule for ${s.server} · ${s.tool}` }
  const mode = (persona ? p.personas[persona]?.[s.server] : undefined) ?? p.servers[s.server] ?? p.default
  const where = persona && p.personas[persona]?.[s.server] ? 'this persona' : p.servers[s.server] ? s.server : 'the default'
  if (mode === 'off') return { action: 'deny', cls, why: `${s.server} is turned off for ${where === 'this persona' ? where : 'panels'}` }
  if (mode === 'all') return { action: 'allow', cls, why: `${where}: every call runs` }
  if (mode === 'ask') return { action: 'ask', cls, why: `${where}: every call asks` }
  return cls === 'read' ? { action: 'allow', cls, why: `a read (${where})` } : { action: 'ask', cls, why: `a write (${where})` }
}

export function cleanPolicy(x: Partial<Policy>): Policy {
  const mode = (m: unknown): m is Mode => typeof m === 'string' && m in MODES
  const rule = (r: unknown): r is ToolRule => r === 'allow' || r === 'ask' || r === 'deny'
  const map = <T>(o: unknown, ok: (v: unknown) => v is T) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).filter(([k, v]) => /^[\w.-]{1,80}(\/[\w.-]{1,120})?$/.test(k) && ok(v))) as Record<string, T>
  return {
    default: mode(x.default) ? x.default : 'reads',
    servers: map(x.servers, mode),
    personas: Object.fromEntries(Object.entries(x.personas ?? {}).map(([k, v]) => [k, map(v, mode)])),
    tools: map(x.tools, rule),
    learned: (x.learned ?? {}) as Policy['learned'],
  }
}
