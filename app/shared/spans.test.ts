import { describe, expect, it } from 'vitest'
import { compare, foldSpans, scoresOf, slowest, toOtlp, tree, type SpanEvent } from './spans'

const EV: SpanEvent[] = [
  { kind: 'model', id: 'm1', parent: null, at: 1000, name: 'claude-sonnet-5-5', inputTokens: 900, outputTokens: 80, cacheRead: 4000 },
  { kind: 'tool', id: 't1', parent: null, at: 1010, name: 'Read', summary: 'src/cart.ts' },
  { kind: 'tool', id: 't2', parent: null, at: 1010, name: 'Task', summary: 'find the failing test' },
  { kind: 'end', id: 't1', at: 1050 },
  { kind: 'model', id: 'm2', parent: 't2', at: 1100, name: 'claude-haiku-4-5', inputTokens: 300, outputTokens: 20, cacheRead: 0 },
  { kind: 'tool', id: 't3', parent: 't2', at: 1110, name: 'Bash', summary: 'npm test' },
  { kind: 'end', id: 't3', at: 3110, error: 'FAIL src/cart.test.ts' },
  { kind: 'end', id: 't2', at: 3200 },
  { kind: 'end', id: 'ghost', at: 3300 },
]

describe('observability', () => {
  it('folds events into spans and a tree with the subagent under its tool', () => {
    const spans = foldSpans(EV)
    expect(spans).toHaveLength(5)
    const t = tree(spans)
    expect(t.map((n) => n.id)).toEqual(['m1', 't1', 't2'])
    expect(t[2]!.children.map((n) => [n.id, n.parent])).toEqual([['m2', 't2'], ['t3', 't2']])
    expect(t[2]!.children[1]).toMatchObject({ end: 3110, error: 'FAIL src/cart.test.ts' })
    expect(slowest(spans, 2).map((s) => s.id)).toEqual(['t2', 't3'])
  })

  it('keeps the latest score of each name for a turn', () => {
    const s = scoresOf([{ turn: 'a', name: 'you', value: 1, at: 1, by: 'you' }, { turn: 'a', name: 'you', value: 0, at: 2, by: 'you' }, { turn: 'b', name: 'you', value: 1, at: 3, by: 'you' }, { turn: 'a', name: 'shape', value: 0.5, at: 1, by: 'eval' }], 'a')
    expect(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.value]))).toEqual({ you: 0, shape: 0.5 })
  })

  it('compares the variants of an experiment', () => {
    const rows = compare([
      { caseId: '1', variant: 'production', answer: '', costUsd: 0.01, ms: 1000, checks: 2, passed: 2, rouge: 0.5 },
      { caseId: '2', variant: 'production', answer: '', costUsd: 0.02, ms: 3000, checks: 2, passed: 1, rouge: 0.3 },
      { caseId: '1', variant: 'staging', answer: '', costUsd: 0.005, ms: 800, checks: 2, passed: 2 },
      { caseId: '2', variant: 'staging', answer: '', costUsd: 0, ms: 0, checks: 0, passed: 0, error: 'budget' },
    ])
    expect(rows[0]).toMatchObject({ variant: 'production', cases: 2, passRate: 0.75, costUsd: 0.03, ms: 2000, errors: 0 })
    expect(rows[0]!.rouge).toBeCloseTo(0.4)
    expect(rows[1]).toMatchObject({ variant: 'staging', passRate: 1, rouge: null, errors: 1 })
  })

  it('writes OTLP JSON, with the prompt only when asked', () => {
    const turn = { id: 's1-t4', at: 1000, ms: 2500, prompt: 'Fix the cart total', persona: 'Reviewer', model: 'claude-sonnet-5-5', costUsd: 0.012, inputTokens: 1200, outputTokens: 100, isError: false, spans: foldSpans(EV), scores: [{ turn: 's1-t4', name: 'you', value: 1, at: 5, by: 'you' as const }] }
    const lean = toOtlp([turn], false)
    const spans = lean.resourceSpans[0]!.scopeSpans[0]!.spans
    expect(spans).toHaveLength(6)
    expect(new Set(spans.map((s) => s.traceId)).size).toBe(1)
    expect(spans[0]!.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(spans.find((s) => s.name === 'Bash')!.parentSpanId).toBe(spans.find((s) => s.name === 'Task')!.spanId)
    expect(spans.find((s) => s.name === 'Bash')!.status).toEqual({ code: 2, message: 'FAIL src/cart.test.ts' })
    expect(JSON.stringify(lean)).not.toContain('Fix the cart total')
    expect(JSON.stringify(lean)).toContain('stm.score.you')
    expect(JSON.stringify(toOtlp([turn], true))).toContain('Fix the cart total')
  })
})

describe('observability ids', () => {
  it('keeps the first of repeated model messages and spreads trace ids', () => {
    const s = foldSpans([{ kind: 'model', id: 'm', parent: null, at: 1, name: 'a', inputTokens: 1, outputTokens: 1, cacheRead: 0 }, { kind: 'model', id: 'm', parent: null, at: 9, name: 'a', inputTokens: 1, outputTokens: 1, cacheRead: 0 }])
    expect(s).toHaveLength(1)
    expect(s[0]!.start).toBe(1)
    const id = toOtlp([{ id: 's1-t1', at: 0, prompt: '', costUsd: 0, inputTokens: 0, outputTokens: 0, isError: false, spans: [], scores: [] }], false).resourceSpans[0]!.scopeSpans[0]!.spans[0]!.traceId
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(id.startsWith('0000')).toBe(false)
  })
})
