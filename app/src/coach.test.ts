import { describe, expect, it } from 'vitest'
import { coach } from './coach'
import { initial, type State } from './state'

const at = (s: Partial<State>): State => ({ ...initial, ...s })
const ids = (s: State, now: number) => coach(s, now).map((t) => t.id)

describe('coach', () => {
  const ctx = { tokens: 90000, window: 200000, percent: 45 }
  it('warns before and after the prompt cache goes cold', () => {
    expect(ids(at({ context: ctx, lastTurnAt: 0 }), 30 * 60000)).toEqual([])
    expect(ids(at({ context: ctx, lastTurnAt: 0 }), 55 * 60000)).toEqual(['cache-ending'])
    const cold = coach(at({ context: ctx, lastTurnAt: 0 }), 61 * 60000)
    expect(cold.map((t) => t.id)).toEqual(['cache-cold'])
    expect(cold[0]!.body).toContain('90k tokens')
    expect(cold[0]!.action).toEqual({ label: 'Compact', prompt: '/compact' })
    // not while working, nor for a tiny context
    expect(ids(at({ context: ctx, lastTurnAt: 0, busy: true }), 61 * 60000)).toEqual([])
    expect(ids(at({ context: { ...ctx, tokens: 5000 }, lastTurnAt: 0 }), 61 * 60000)).toEqual([])
  })

  it('suggests compacting a full context', () => {
    expect(coach(at({ context: { ...ctx, percent: 64 } }), 0)).toMatchObject([{ id: 'ctx-high', tone: 'info' }])
    expect(coach(at({ context: { ...ctx, percent: 85 } }), 0)).toMatchObject([{ id: 'ctx-high', tone: 'warn' }])
  })

  it('suggests a cheaper model when a top one only reads', () => {
    const reads = Array.from({ length: 6 }, () => ({ kind: 'tool' as const, name: 'Read', summary: 'x' }))
    expect(ids(at({ model: 'claude-opus-5-5', lines: reads }), 0)).toEqual(['explore-model'])
    expect(ids(at({ model: 'claude-haiku-5-5', lines: reads }), 0)).toEqual([])
    expect(ids(at({ model: 'claude-opus-5-5', lines: [...reads, { kind: 'tool', name: 'Edit', summary: 'x' }] }), 0)).toEqual([])
  })

  it('warns when a plan window is nearly spent', () => {
    expect(ids(at({ limits: { five_hour: { percentUsed: 85 }, seven_day: { percentUsed: 40 } } }), 0)).toEqual(['limit-five_hour'])
  })

  it('suggests a pause after a long stretch, and keeps quiet during focus', () => {
    expect(ids(at({}), 0)).toEqual([])
    expect(coach(at({}), 0, { stretch: 100 * 60000 })).toMatchObject([{ id: 'break', title: '1h40 without a pause' }])
    const tips = { context: { tokens: 90000, window: 200000, percent: 64 } }
    expect(ids(at(tips), 0)).toEqual(['ctx-high'])
    expect(coach(at(tips), 0, { focus: true })).toEqual([])
  })
})
