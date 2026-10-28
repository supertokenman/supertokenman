import { describe, expect, it } from 'vitest'
import { callSignature, LoopGuard, loopConfig, LOOP_DEFAULTS, messageCost, normalizeError, tripHeadline } from './loopguard'

const run = (g: LoopGuard, calls: [string, unknown][]) => calls.map(([t, i]) => g.call(t, i))

describe('loop guard', () => {
  it('trips on the same call 4 times within 6, not before', () => {
    const g = new LoopGuard()
    const r = run(g, Array.from({ length: 4 }, () => ['Bash', { command: 'npm test' }] as [string, unknown]))
    expect(r.slice(0, 3)).toEqual([null, null, null])
    expect(r[3]).toMatchObject({ why: 'repeat', tool: 'Bash', count: 4 })
    expect(r[3]!.steps).toHaveLength(4)
    expect(tripHeadline(r[3]!)).toBe('Paused: the same Bash call repeated 4 times.')
  })
  it('counts near-identical inputs as the same: whitespace, key order, timestamps, temp paths', () => {
    const g = new LoopGuard()
    const r = run(g, [
      ['Bash', { command: 'curl  localhost:3000 ', description: 'x' }],
      ['Bash', { description: 'x', command: 'curl localhost:3000' }],
      ['Bash', { command: 'curl localhost:3000\n', description: 'x' }],
      ['Bash', { command: ' curl localhost:3000', description: 'x' }],
    ])
    expect(r[3]?.why).toBe('repeat')
    expect(callSignature('Bash', 'cat /tmp/tmp.aB12/out.log at 2026-10-28T10:00:01Z')).toBe(callSignature('Bash', 'cat /tmp/tmp.ZZ99/out.log at 2026-10-28T11:22:33Z'))
  })
  it('does not trip on reads of different files', () => {
    const g = new LoopGuard()
    const r = run(g, Array.from({ length: 12 }, (_, i) => ['Read', { file_path: `/p/src/file${i}.ts` }] as [string, unknown]))
    expect(r.every((x) => x === null)).toBe(true)
  })
  it('a different step in between pushes the repeats out of the window', () => {
    const g = new LoopGuard()
    const r = run(g, [['Bash', 'ls'], ['Read', 'a'], ['Read', 'b'], ['Bash', 'ls'], ['Read', 'c'], ['Read', 'd'], ['Bash', 'ls'], ['Read', 'e'], ['Bash', 'ls']])
    expect(r.every((x) => x === null)).toBe(true)
  })
  it('reset (a new message from the person) starts over', () => {
    const g = new LoopGuard()
    run(g, [['Bash', 'ls'], ['Bash', 'ls'], ['Bash', 'ls']])
    g.reset()
    expect(g.call('Bash', 'ls')).toBeNull()
  })
  it('trips on oscillation A,B,A,B,A,B', () => {
    const g = new LoopGuard()
    const r = run(g, [['Edit', 'x=1'], ['Bash', 'npm test'], ['Edit', 'x=1'], ['Bash', 'npm test'], ['Edit', 'x=1'], ['Bash', 'npm test']])
    expect(r.slice(0, 5).every((x) => x === null)).toBe(true)
    expect(r[5]).toMatchObject({ why: 'oscillation', tool: 'Edit and Bash', count: 3 })
    expect(r[5]!.steps).toHaveLength(6)
  })
  it('trips on the same error 3 times in a row, line numbers aside', () => {
    const g = new LoopGuard()
    expect(g.error('TypeError: x is undefined at app.ts:12:5', 'Bash')).toBeNull()
    expect(g.error('TypeError: x is undefined at app.ts:14:9', 'Bash')).toBeNull()
    expect(g.error('TypeError: x is undefined at app.ts:15:1\n  more', 'Bash')).toMatchObject({ why: 'error', count: 3, tool: 'Bash' })
    expect(normalizeError('Error at line 12')).toBe(normalizeError('error at line 99'))
  })
  it('a different error in between is not a loop', () => {
    const g = new LoopGuard()
    g.error('ENOENT a', 'Read')
    g.error('EACCES b', 'Read')
    expect(g.error('ENOENT a', 'Read')).toBeNull()
  })
  it('sums the cost of the repeats (not the first call), one count per model message', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 4; i++) {
      g.spend(0.01 * (i + 1), 100, `m${i}`)
      g.spend(0.01 * (i + 1), 100, `m${i}`) // the same message seen again
      const t = g.call('Bash', 'npm test')
      if (i === 3) {
        expect(t!.usd).toBeCloseTo(0.02 + 0.03 + 0.04)
        expect(t!.tokens).toBe(300)
      }
    }
  })
  it('the error trip counts what was spent since the first error', () => {
    const g = new LoopGuard()
    for (let i = 0; i < 3; i++) {
      g.spend(0.1, 50, `m${i}`)
      g.call('Bash', `try ${i}`)
      const t = g.error('boom', 'Bash')
      if (i === 2) expect(t).toMatchObject({ tokens: 100 })
    }
  })
  it('off does not trip; settings are clamped and default to 4 in 6 and 3 errors', () => {
    const g = new LoopGuard({ ...LOOP_DEFAULTS, on: false })
    expect(run(g, Array.from({ length: 8 }, () => ['Bash', 'ls'] as [string, unknown])).every((x) => x === null)).toBe(true)
    expect(loopConfig(undefined)).toEqual({ on: true, repeats: 4, window: 6, errors: 3 })
    expect(loopConfig({ repeats: 99, window: 1, errors: 'x' })).toEqual({ on: true, repeats: 20, window: 20, errors: 3 })
  })
  it('prices a model message from the price table', () => {
    const c = messageCost('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 0 })
    expect(c.tokens).toBe(1_000_000)
    expect(c.usd).toBeGreaterThan(0)
  })
})
