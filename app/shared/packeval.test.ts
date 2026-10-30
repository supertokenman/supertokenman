import { describe, expect, it } from 'vitest'
import { comparePackEval, outcomeOf, type EvalSide } from './packeval.js'
import type { TestRun } from './fanout.js'

const side = (o: Partial<EvalSide> = {}): EvalSide => ({
  sid: 's', attempt: 1, model: 'm', busy: false, costUsd: 1, ms: 100_000, files: 2, added: 10, removed: 1,
  tests: null, turns: 10, tokens: 50_000, ok: true, capped: false, ...o,
})
const run = (ok: boolean): TestRun => ({ cmd: 'npm test', ok, passed: 1, failed: ok ? 0 : 1, ms: 1, tail: '' })

describe('packeval', () => {
  it('computes deltas and percent of the base', () => {
    const c = comparePackEval(side({ costUsd: 0.8, ms: 150_000, turns: 5, tokens: 40_000 }), side())
    expect(c.deltas.costUsd).toEqual({ abs: expect.closeTo(-0.2), pct: expect.closeTo(-20) })
    expect(c.deltas.ms.pct).toBe(50)
    expect(c.deltas.turns.pct).toBe(-50)
    expect(c.deltas.tokens.pct).toBe(-20)
  })

  it('gives a null percent when the base is zero', () => {
    const c = comparePackEval(side({ costUsd: 0.5 }), side({ costUsd: 0 }))
    expect(c.deltas.costUsd.pct).toBeNull()
    expect(c.verdict).toBe('Too close to call: deltas under 10 percent, same result.')
  })

  it('names the cheaper and faster side when the same result is reached with a 10 percent gap', () => {
    const c = comparePackEval(side({ costUsd: 0.7, ms: 80_000 }), side())
    expect(c.comparable).toBe(true)
    expect(c.verdict).toBe('With pack: 30% cheaper, 20% faster, same result.')
  })

  it('reports a slower or pricier pack run in the same words', () => {
    expect(comparePackEval(side({ costUsd: 1.5 }), side()).verdict).toBe('With pack: 50% pricier, same result.')
    expect(comparePackEval(side({ ms: 120_000 }), side()).verdict).toBe('With pack: 20% slower, same result.')
  })

  it('is too close to call when every gap is under 10 percent', () => {
    const c = comparePackEval(side({ costUsd: 1.05, ms: 95_000 }), side())
    expect(c.verdict).toBe('Too close to call: deltas under 10 percent, same result.')
    expect(c.comparable).toBe(true)
  })

  it('never names a winner when a run failed, and flags the side', () => {
    const c = comparePackEval(side({ ok: false, costUsd: 0.1 }), side())
    expect(c.comparable).toBe(false)
    expect(c.flags).toEqual(['With pack: run failed'])
    expect(c.verdict).toBe('Not comparable: With pack: run failed.')
  })

  it('flags a run that hit the turn cap or is still busy', () => {
    const c = comparePackEval(side(), side({ capped: true, busy: true }))
    expect(c.comparable).toBe(false)
    expect(c.flags).toEqual(['Without pack: hit the turn cap', 'Without pack: still running'])
  })

  it('reports a different result without comparing cost or time', () => {
    const c = comparePackEval(side({ tests: run(true), costUsd: 0.1 }), side({ tests: run(false) }))
    expect(c.sameResult).toBe(false)
    expect(c.comparable).toBe(true)
    expect(c.verdict).toBe('Different result: with pack tests pass, without tests fail. Cost and time not compared.')
  })

  it('treats equal test outcomes as the same result and uses files when no tests ran', () => {
    expect(comparePackEval(side({ tests: run(true) }), side({ tests: run(true) })).sameResult).toBe(true)
    expect(outcomeOf(side({ files: 0 }))).toBe('no changes')
    expect(outcomeOf(side({ files: 3 }))).toBe('changed files')
    expect(comparePackEval(side({ files: 0 }), side({ files: 0 })).sameResult).toBe(true)
  })

  it('always carries the one-run caveat', () => {
    expect(comparePackEval(side(), side()).note).toBe('One run per side is weak evidence.')
  })
})
