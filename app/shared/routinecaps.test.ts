import { describe, expect, it } from 'vitest'
import { afterRun, capDecision, clampCaps, DEFAULT_CAPS, firable, hookAllowed, reenable, type Capped } from './routinecaps'

const every = (minutes: number) => ({ kind: 'every' as const, minutes })
const item = (id: string, enabled = true, extra: Partial<Capped> = {}): Capped => ({ id, enabled, when: every(60), ...extra })
const many = (n: number, enabled = true) => Array.from({ length: n }, (_, i) => item(`t${i}`, enabled))

describe('capDecision: minimum interval', () => {
  it('refuses an every below 5 minutes and allows 5', () => {
    expect(capDecision([], { id: 'a', when: every(4), enabled: false }, 0)).toMatchObject({ ok: false })
    expect(capDecision([], { id: 'a', when: every(1), enabled: true }, 0)).toMatchObject({ ok: false })
    expect(capDecision([], { id: 'a', when: every(5), enabled: true }, 0)).toEqual({ ok: true })
  })

  it('does not apply to schedules and PR reviews', () => {
    expect(capDecision([], { id: 'a', when: { kind: 'schedule', days: [1], time: '09:00' }, enabled: true }, 0)).toEqual({ ok: true })
    expect(capDecision([], { id: 'a', when: { kind: 'pr-review' }, enabled: true }, 0)).toEqual({ ok: true })
  })
})

describe('capDecision: enabled total', () => {
  it('allows the 20th enabled and refuses the 21st', () => {
    expect(capDecision(many(19), { id: 'new', when: every(60), enabled: true }, 0)).toEqual({ ok: true })
    const r = capDecision(many(20), { id: 'new', when: every(60), enabled: true }, 0)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toContain('20')
  })

  it('saving an already enabled item does not count it twice, and disabled items do not count', () => {
    expect(capDecision(many(20), { id: 't3', when: every(60), enabled: true }, 0)).toEqual({ ok: true })
    expect(capDecision(many(20, false), { id: 'new', when: every(60), enabled: true }, 0)).toEqual({ ok: true })
    expect(capDecision(many(20), { id: 'new', when: every(60), enabled: false }, 0)).toEqual({ ok: true })
  })

  it('respects a lowered setting', () => {
    expect(capDecision(many(2), { id: 'new', when: every(60), enabled: true }, 0, { ...DEFAULT_CAPS, maxEnabled: 2 })).toMatchObject({ ok: false })
  })
})

describe('afterRun', () => {
  it('counts consecutive failures and disables at 10 with a reason and note', () => {
    let t = item('a')
    for (let i = 1; i < 10; i++) {
      t = afterRun(t, false)
      expect(t.enabled).toBe(true)
      expect(t.failures).toBe(i)
    }
    t = afterRun(t, false)
    expect(t).toMatchObject({ enabled: false, disabledReason: 'failures', failures: 10 })
    expect(t.note).toContain('10')
  })

  it('a success resets the count, so nine failures then a success does not disable', () => {
    let t = item('a')
    for (let i = 0; i < 9; i++) t = afterRun(t, false)
    t = afterRun(t, true)
    expect(t.failures).toBe(0)
    t = afterRun(t, false)
    expect(t.enabled).toBe(true)
  })

  it('leaves the input unchanged', () => {
    const t = item('a')
    afterRun(t, false)
    expect(t.failures).toBeUndefined()
  })

  it('uses a lowered failure cap from settings', () => {
    const t = afterRun(afterRun(item('a'), false, { ...DEFAULT_CAPS, maxFailures: 2 }), false, { ...DEFAULT_CAPS, maxFailures: 2 })
    expect(t).toMatchObject({ enabled: false, disabledReason: 'failures' })
  })
})

describe('clampCaps', () => {
  it('uses the defaults for missing values and keeps the hard limits', () => {
    expect(clampCaps(undefined)).toEqual(DEFAULT_CAPS)
    expect(clampCaps({ minEvery: 1, maxEnabled: 500, maxFailures: 0 })).toEqual({ minEvery: 5, maxEnabled: 50, maxFailures: 3 })
    expect(clampCaps({ minEvery: 'x' as unknown as number, maxEnabled: 7 })).toEqual({ minEvery: 5, maxEnabled: 7, maxFailures: 10 })
  })
})

describe('firable, hookAllowed, reenable', () => {
  const every = { kind: 'every' as const, minutes: 30 }
  it('keeps the most recently armed items firing beyond the cap, and disables nothing', () => {
    const list = Array.from({ length: 22 }, (_, i) => ({ id: `t${i}`, enabled: true, when: every, armedAt: i }))
    const ok = firable(list)
    expect(ok.size).toBe(20)
    expect(ok.has('t0')).toBe(false)
    expect(ok.has('t1')).toBe(false)
    expect(ok.has('t21')).toBe(true)
    expect(list.every((x) => x.enabled)).toBe(true)
  })
  it('drops a webhook fire inside 5 minutes', () => {
    expect(hookAllowed(undefined, 1000)).toBe(true)
    expect(hookAllowed(0, 4 * 60_000)).toBe(false)
    expect(hookAllowed(0, 5 * 60_000)).toBe(true)
  })
  it('re-enable clears the failure state', () => {
    const t = afterRun<Capped>({ id: 'a', enabled: true, when: every, failures: 9 }, false)
    expect(t.enabled).toBe(false)
    const back = reenable(t)
    expect(back).toMatchObject({ enabled: true, failures: 0 })
    expect(back.disabledReason).toBeUndefined()
    expect(back.note).toBeUndefined()
  })
})
