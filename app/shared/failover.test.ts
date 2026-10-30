import { describe, expect, it } from 'vitest'
import { backoff, decide } from './failover'
import type { Failure } from './failkind'

const cur = { model: 'opus', provider: undefined }
const limit: Failure = { kind: 'plan_window', window: 'five_hour', resetsAt: '2026-10-30T14:30:00.000Z', raw: '' }
const sonnet = { model: 'sonnet' }

describe('decide', () => {
  it('never offers a failover for other errors', () => {
    expect(decide({ kind: 'other', raw: '' }, { fallback: sonnet, always: true }, cur).act).toBe('none')
  })
  it('shows a card when no fallback is configured, with a wait time for a reset', () => {
    const d = decide(limit, {}, cur)
    expect(d.act).toBe('card')
    expect(d.waitUntil).toBe('2026-10-30T14:30:30.000Z')
    expect(d.reason).toContain('5-hour limit reached')
  })
  it('shows a card by default, switches only when always is set', () => {
    expect(decide(limit, { fallback: sonnet }, cur).act).toBe('card')
    expect(decide(limit, { fallback: sonnet, always: true }, cur).act).toBe('switch')
  })
  it('does nothing when the fallback is the current model', () => {
    expect(decide(limit, { fallback: { model: 'opus' }, always: true }, cur).act).toBe('none')
  })
  it('allows one hop only; a failing fallback gets a card again', () => {
    expect(decide(limit, { fallback: sonnet, always: true }, cur, { hop: 1 })).toMatchObject({ act: 'card' })
  })
  it('does not switch to another account unless approved', () => {
    const other = { provider: 'acme' }
    expect(decide(limit, { fallback: other, always: true }, cur).act).toBe('card')
    expect(decide(limit, { fallback: other, always: true, approved: ['acme'] }, cur).act).toBe('switch')
    expect(decide(limit, { fallback: { model: 'sonnet' }, always: true }, { model: 'opus', provider: 'acme' }).act).toBe('switch')
  })
  it('backs off overloaded and api_down errors without a reset time', () => {
    const now = Date.parse('2026-10-30T10:00:00.000Z')
    const d = decide({ kind: 'overloaded', raw: '' }, {}, cur, { now, attempt: 1 })
    expect(d.waitUntil).toBe('2026-10-30T10:02:00.000Z')
    expect(decide({ kind: 'api_down', raw: '' }, {}, cur).waitUntil).toBeUndefined()
    expect(decide({ kind: 'api_down', raw: '' }, {}, cur, { now, attempt: 4 }).waitUntil).toBeUndefined()
  })
})

describe('backoff', () => {
  it('follows 1, 2, 5, 10 minutes then stops', () => {
    expect([0, 1, 2, 3].map((n) => backoff(n))).toEqual([60_000, 120_000, 300_000, 600_000])
    expect(backoff(4)).toBeNull()
  })
})
