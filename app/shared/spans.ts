// Observability, the parts with no network: spans of a turn put into a tree (model calls, tool calls,
// subagents under the tool that started them) with their timing, scores attached to turns, datasets of
// real prompts and an experiment's results compared, and the turn as OpenTelemetry JSON for your own
// Langfuse. Ideas from Langfuse (MIT; its ee/ folders are not used); no code is copied.

export type SpanEvent =
  | { kind: 'model'; id: string; parent: string | null; at: number; name: string; inputTokens: number; outputTokens: number; cacheRead: number }
  | { kind: 'tool'; id: string; parent: string | null; at: number; name: string; summary: string }
  | { kind: 'end'; id: string; at: number; error?: string }

export type Span = { id: string; kind: 'model' | 'tool'; name: string; summary?: string; parent: string | null; start: number; end?: number; error?: string; inputTokens?: number; outputTokens?: number; cacheRead?: number }
export type SpanNode = Span & { children: SpanNode[] }

/** The events of a turn folded into spans: a tool span closes on its result; a model span is a moment. */
export function foldSpans(events: SpanEvent[]): Span[] {
  const out = new Map<string, Span>()
  for (const e of events) {
    if (e.kind === 'end') {
      const s = out.get(e.id)
      if (s) Object.assign(s, { end: e.at, ...(e.error ? { error: e.error } : {}) })
    } else if (e.kind === 'model') {
      // one API message can come as several assistant messages with the same id: the first one counts
      if (!out.has(e.id)) out.set(e.id, { id: e.id, kind: 'model', name: e.name, parent: e.parent, start: e.at, end: e.at, inputTokens: e.inputTokens, outputTokens: e.outputTokens, cacheRead: e.cacheRead })
    } else out.set(e.id, { id: e.id, kind: 'tool', name: e.name, summary: e.summary, parent: e.parent, start: e.at })
  }
  return [...out.values()]
}

/** Spans as a tree: a subagent's calls sit under the tool call (Task or Agent) that started it. */
export function tree(spans: Span[]): SpanNode[] {
  const nodes = new Map(spans.map((s) => [s.id, { ...s, children: [] as SpanNode[] }]))
  const roots: SpanNode[] = []
  for (const n of nodes.values()) {
    const p = n.parent ? nodes.get(n.parent) : undefined
    if (p) p.children.push(n)
    else roots.push(n)
  }
  const sort = (l: SpanNode[]) => (l.sort((a, b) => a.start - b.start), l.forEach((c) => sort(c.children)), l)
  return sort(roots)
}

/** The slowest tool calls of a turn, for "where did the time go". */
export function slowest(spans: Span[], n = 3): Span[] {
  return spans.filter((s) => s.kind === 'tool' && s.end != null).sort((a, b) => b.end! - b.start - (a.end! - a.start)).slice(0, n)
}

export type Score = { turn: string; name: string; value: number; note?: string; at: number; by: 'you' | 'eval' | 'rouge' }

/** The scores of a turn by name, the latest one winning. */
export function scoresOf(all: Score[], turn: string): Record<string, Score> {
  const out: Record<string, Score> = {}
  for (const s of all) if (s.turn === turn && (!out[s.name] || out[s.name]!.at <= s.at)) out[s.name] = s
  return out
}

export type Case = { id: string; prompt: string; persona?: string; expected?: string; from?: string }
export type Dataset = { id: string; name: string; cases: Case[]; at: number }
export type RunResult = { caseId: string; variant: string; answer: string; costUsd: number; ms: number; checks: number; passed: number; rouge?: number; error?: string }

/** One line per variant: how many cases it got right, its cost and its speed, from an experiment's results. */
export function compare(results: RunResult[]): { variant: string; cases: number; passRate: number; rouge: number | null; costUsd: number; ms: number; errors: number }[] {
  const by = new Map<string, RunResult[]>()
  for (const r of results) by.set(r.variant, [...(by.get(r.variant) ?? []), r])
  return [...by].map(([variant, rs]) => {
    const checks = rs.reduce((n, r) => n + r.checks, 0)
    const withRouge = rs.filter((r) => r.rouge != null)
    return {
      variant,
      cases: rs.length,
      passRate: checks ? rs.reduce((n, r) => n + r.passed, 0) / checks : 1,
      rouge: withRouge.length ? withRouge.reduce((n, r) => n + r.rouge!, 0) / withRouge.length : null,
      costUsd: rs.reduce((n, r) => n + r.costUsd, 0),
      ms: Math.round(rs.reduce((n, r) => n + r.ms, 0) / rs.length),
      errors: rs.filter((r) => r.error).length,
    }
  })
}

/** A stable id of `len` hex digits from a string: FNV-1a, once per 8 digits with a different seed. */
const hex = (s: string, len: number) => {
  let out = ''
  for (let k = 0; out.length < len; k++) {
    let h = (0x811c9dc5 ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, len)
}
const nano = (ms: number) => `${BigInt(Math.round(ms)) * 1_000_000n}`
const attr = (key: string, v: string | number | boolean) => ({ key, value: typeof v === 'number' ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : typeof v === 'boolean' ? { boolValue: v } : { stringValue: v } })

export type TurnForExport = { id: string; at: number; ms?: number; prompt: string; persona?: string; model?: string; costUsd: number; inputTokens: number; outputTokens: number; isError: boolean; spans: Span[]; scores: Score[] }

/**
 * A turn as an OTLP/JSON trace: the turn is the root span, model and tool calls its children (the
 * GenAI semantic names Langfuse reads). The prompt goes only when `withText` is on.
 */
export function toOtlp(turns: TurnForExport[], withText: boolean, service = 'supertokenman') {
  const spans = turns.flatMap((t) => {
    const traceId = hex(t.id, 32)
    const rootId = hex(`${t.id}:root`, 16)
    const end = t.at + (t.ms ?? Math.max(0, ...t.spans.map((s) => (s.end ?? s.start) - t.at)))
    const root: { traceId: string; spanId: string; parentSpanId?: string; name: string; kind: number; startTimeUnixNano: string; endTimeUnixNano: string; status: { code: number; message?: string }; attributes: ReturnType<typeof attr>[] } = {
      traceId,
      spanId: rootId,
      name: `turn ${t.persona ?? 'panel'}`,
      kind: 1,
      startTimeUnixNano: nano(t.at),
      endTimeUnixNano: nano(end),
      status: { code: t.isError ? 2 : 1 },
      attributes: [attr('gen_ai.request.model', t.model || t.spans.find((s) => s.kind === 'model')?.name || ''), attr('gen_ai.usage.input_tokens', t.inputTokens), attr('gen_ai.usage.output_tokens', t.outputTokens), attr('stm.cost_usd', t.costUsd), attr('stm.turn', t.id), ...(t.persona ? [attr('stm.persona', t.persona)] : []), ...(withText ? [attr('input.value', t.prompt)] : []), ...t.scores.map((s) => attr(`stm.score.${s.name}`, s.value))],
    }
    const children = t.spans.map((s) => ({
      traceId,
      spanId: hex(s.id, 16),
      parentSpanId: s.parent ? hex(s.parent, 16) : rootId,
      name: s.kind === 'model' ? `model ${s.name}` : s.name,
      kind: 1,
      startTimeUnixNano: nano(s.start),
      endTimeUnixNano: nano(s.end ?? s.start),
      status: { code: s.error ? 2 : 1, ...(s.error ? { message: s.error } : {}) },
      attributes: s.kind === 'model' ? [attr('gen_ai.request.model', s.name), attr('gen_ai.usage.input_tokens', s.inputTokens ?? 0), attr('gen_ai.usage.output_tokens', s.outputTokens ?? 0)] : [attr('tool.name', s.name), ...(withText && s.summary ? [attr('input.value', s.summary)] : [])],
    }))
    return [root, ...children]
  })
  return { resourceSpans: [{ resource: { attributes: [attr('service.name', service)] }, scopeSpans: [{ scope: { name: 'supertokenman' }, spans }] }] }
}
