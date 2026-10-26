import { describe, expect, it } from 'vitest'
import { lastDay, record, snapshot } from './day'
import { initial } from './state'

describe('day', () => {
  it('snapshots panels that worked, with their last answer', () => {
    const s = { ...initial, cwd: '/u/engine', sessionId: 'abc', turns: 3, costUsd: 1.2, lastTurnAt: 50, lines: [{ kind: 'assistant' as const, text: '## Queue retry done\nmore' }] }
    const idle = { ...initial, cwd: '/u/other' }
    expect(snapshot({ order: ['a', 'b'], byId: { a: s, b: idle }, focus: null })).toEqual([{ cwd: '/u/engine', sessionId: 'abc', last: 'Queue retry done', at: 50, costUsd: 1.2, turns: 3 }])
  })
  it('keeps the newest stop per folder and finds yesterday', () => {
    const a = { cwd: '/u/e', last: 'old', at: 1, costUsd: 0, turns: 1 }
    const b = { cwd: '/u/e', last: 'new', at: 2, costUsd: 0, turns: 2 }
    let logs = record([], [a], '2026-10-22')
    logs = record(logs, [b], '2026-10-22')
    expect(logs[0]!.stops.map((s) => s.last)).toEqual(['new'])
    logs = record(logs, [a], '2026-10-23')
    expect(lastDay(logs, '2026-10-23')?.date).toBe('2026-10-22')
  })
})
