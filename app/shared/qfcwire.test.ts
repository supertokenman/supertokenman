import { describe, expect, it } from 'vitest'
import { cardOf, clock, modelLabel, reasonText, switchNote } from './qfcwire'
import type { Failure } from './failkind'

const plan: Failure = { kind: 'plan_window', window: 'five_hour', resetsAt: '2026-10-30T14:30:00.000Z', raw: 'Claude AI usage limit reached|1' }

describe('qfcwire', () => {
  it('labels models', () => {
    expect(modelLabel('claude-opus-4-8')).toBe('opus 4.8')
    expect(modelLabel('claude-sonnet-4-5-20250929')).toBe('sonnet 4.5')
    expect(modelLabel()).toBe('the current model')
  })
  it('says the reset time as a clock', () => {
    expect(clock(plan.resetsAt!, 'UTC')).toBe('14:30')
    expect(reasonText(plan, 'UTC')).toBe('5-hour limit reached, resets 14:30')
  })
  it('writes the transcript note for a switch', () => {
    expect(switchNote({ model: 'claude-opus-4-8' }, { model: 'claude-sonnet-4-6' }, plan, false, 'UTC')).toBe('Switched from opus 4.8 to sonnet 4.6: 5-hour limit reached, resets 14:30.')
    expect(switchNote({ model: 'claude-opus-4-8' }, { provider: 'custom' }, plan, true, 'UTC')).toMatch(/^Switched automatically from opus 4.8 to the custom endpoint/)
  })
  it('builds a card with no fallback: switch is not offered', () => {
    const c = cardOf({ id: 'c1', failure: plan, decision: { act: 'card', reason: 'x', waitUntil: '2026-10-30T14:30:30.000Z' }, prefs: {}, attempt: 0, prompt: 'do it', canResume: true, timeZone: 'UTC' })
    expect(c.fallback).toBeUndefined()
    expect(c.noSwitch).toMatch(/No fallback/)
    expect(c.always).toBe(false)
    expect(c.waitUntil).toBe('2026-10-30T14:30:30.000Z')
  })
  it('asks again before the custom endpoint and disables it when off or without a session', () => {
    const base = { id: 'c', failure: plan, decision: { act: 'card' as const, reason: '' }, prefs: { fallback: { provider: 'custom' } }, attempt: 0, prompt: 'p' }
    expect(cardOf({ ...base, custom: { on: true, url: 'http://127.0.0.1:8080' }, canResume: true }).confirm).toMatch(/127.0.0.1/)
    expect(cardOf({ ...base, custom: { on: false, url: '' }, canResume: true }).noSwitch).toMatch(/off/)
    expect(cardOf({ ...base, custom: { on: true, url: 'http://x' }, canResume: false }).noSwitch).toMatch(/no session/)
  })
  it('a model fallback needs nothing more', () => {
    const c = cardOf({ id: 'c', failure: plan, decision: { act: 'card', reason: '' }, prefs: { fallback: { model: 'claude-sonnet-4-6' } }, attempt: 0, prompt: 'p', canResume: false })
    expect(c.fallback?.label).toBe('sonnet 4.6')
    expect(c.noSwitch).toBeUndefined()
    expect(c.confirm).toBeUndefined()
  })
})
