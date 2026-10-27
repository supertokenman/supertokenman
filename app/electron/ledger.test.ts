import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dayKey, ledger, priceOf, summarize } from './ledger'

const fresh = () => ledger(join(mkdtempSync(join(tmpdir(), 'ledger-')), 'savings.json'))

describe('ledger', () => {
  it('prices cache reads against full input price', () => {
    const l = fresh()
    l.turn('claude-sonnet-4-6', 0.5, 1000, 1_000_000)
    const s = summarize(l.read(), '0000')
    expect(s.billedUsd).toBe(0.5)
    expect(s.bySource[0]).toMatchObject({ id: 'cache', tokens: 1_000_000 })
    expect(s.bySource[0]!.usd).toBeCloseTo(2.7)
  })
  it('adds sources, largest first, and keeps the tool’s own price', () => {
    const l = fresh()
    l.save('web-reader', 1000, 'opus')
    l.save('headroom', 10, '', 3)
    l.save('condenser', 0)
    const s = summarize(l.read(), '0000')
    expect(s.bySource.map((b) => b.id)).toEqual(['headroom', 'web-reader'])
    expect(s.savedUsd).toBeCloseTo(3.005)
  })
  it('filters by day', () => {
    const l = fresh()
    l.save('local-model', 100, '', 1, new Date(2026, 0, 1).getTime())
    l.save('local-model', 100, '', 2, new Date(2026, 0, 5).getTime())
    expect(summarize(l.read(), dayKey(new Date(2026, 0, 3).getTime())).savedUsd).toBe(2)
  })
  it('counts turns that found the cache lapsed', () => {
    const l = fresh()
    l.lapse(0.2)
    l.lapse(0.3)
    l.lapse(0)
    expect(summarize(l.read(), '0000').lapsed).toEqual({ count: 2, usd: 0.5 })
  })
  it('prices unknown models like a mid model', () => expect(priceOf('x')[1]).toBe(3))
})
