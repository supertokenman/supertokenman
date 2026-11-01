import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS, spend, startBudget, summarize, type SpendKind } from './browserbudget'

const T0 = 1_000_000
const run = (kind: SpendKind, times: number, b = startBudget(T0), now = T0) => {
  let cur = b
  let stop: string | null = null
  for (let i = 0; i < times; i++) {
    const r = spend(cur, kind, now)
    cur = r.budget
    stop = r.stop
  }
  return { cur, stop }
}

describe('browser budget', () => {
  it('has the spec defaults: 30 steps, 10 minutes, 10 screenshots, 5 new hosts', () => {
    expect(DEFAULT_LIMITS).toEqual({ steps: 30, wallMs: 600_000, screenshots: 10, newHosts: 5 })
  })
  it('allows the 30th step and stops at the 31st, with the reason steps', () => {
    expect(run('step', 30).stop).toBeNull()
    const over = run('step', 31)
    expect(over.stop).toBe('steps')
    expect(over.cur.ended).toBe('steps')
    expect(over.cur.steps).toBe(30)
  })
  it('stops on screenshots at the 11th and on new hosts at the 6th', () => {
    expect(run('screenshot', 10).stop).toBeNull()
    expect(run('screenshot', 11).stop).toBe('screenshots')
    expect(run('newHost', 5).stop).toBeNull()
    expect(run('newHost', 6).stop).toBe('new-hosts')
  })
  it('stops at the wall time limit, not before', () => {
    expect(spend(startBudget(T0), 'step', T0 + 599_999).stop).toBeNull()
    const late = spend(startBudget(T0), 'step', T0 + 600_000)
    expect(late.stop).toBe('wall-time')
    expect(late.budget.steps).toBe(0)
  })
  it('stays ended: later spends are refused with the same reason and do not count', () => {
    const ended = run('step', 31).cur
    const again = spend(ended, 'screenshot', T0)
    expect(again.stop).toBe('steps')
    expect(again.budget.screenshots).toBe(0)
  })
  it('keeps the start time and limits when counts move', () => {
    const b = run('step', 3).cur
    expect(b.started).toBe(T0)
    expect(b.limits).toEqual(DEFAULT_LIMITS)
  })
  it('summarises the end for the person', () => {
    expect(summarize(startBudget(T0))).toBe('Within budget. 0/30 steps, 0/10 screenshots, 0/5 new hosts.')
    expect(summarize(run('step', 31).cur)).toBe('Stopped: the step limit was reached. 30/30 steps, 0/10 screenshots, 0/5 new hosts.')
  })
})
