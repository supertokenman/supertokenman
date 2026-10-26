// The trace of a panel: what went into its system prompt, part by part, and for each turn who answered,
// why it went there, which tools ran and what it cost. Read in the Trace sheet, so a surprising answer
// or bill can be explained from what the app actually sent.

export type ContextPart = { name: string; chars: number; tokens: number; text: string }
export type TraceTurn = {
  /** the turn's id, also on each of its tool calls in the tool log */
  id?: string
  at: number
  /** the persona the panel runs as, if any */
  persona?: string
  model?: string
  /** why the message went to this panel: the router's words, a spec task, a trigger */
  why?: string
  prompt: string
  tools: string[]
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  isError: boolean
  ms?: number
  goal?: string
  /** model and tool calls, subagents under the tool that started them */
  spans?: import('./spans.js').Span[]
}

/** A rough token count: about 4 characters a token for prose, fewer for code. */
export const roughTokens = (s: string) => Math.ceil(s.length / 3.6)

/** The parts of the appended system prompt with their sizes, biggest first; empty parts are left out. */
export function contextParts(parts: { name: string; text?: string }[]): ContextPart[] {
  return parts
    .filter((p): p is { name: string; text: string } => !!p.text?.trim())
    .map((p) => ({ name: p.name, chars: p.text.length, tokens: roughTokens(p.text), text: p.text }))
    .sort((a, b) => b.tokens - a.tokens)
}

/** Adds a turn at the front and keeps the last `keep`. */
export const addTurn = (list: TraceTurn[], t: TraceTurn, keep = 60) => [t, ...list].slice(0, keep)

/** One line on why a turn cost what it did. */
export function whyCost(t: TraceTurn): string {
  const fresh = Math.max(0, t.inputTokens)
  const parts = [`${fresh.toLocaleString('en-US')} new input`, `${t.cacheRead.toLocaleString('en-US')} from cache`, `${t.outputTokens.toLocaleString('en-US')} written`]
  if (t.tools.length) parts.push(`${t.tools.length} tool call${t.tools.length === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
