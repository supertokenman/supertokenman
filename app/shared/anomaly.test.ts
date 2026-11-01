import { describe, expect, it } from 'vitest'
import { band, check, mad, median, noteDue, shapeOf, toneOf, turnClock, type Sample } from './anomaly'

const s = (cost: number, tokens = 20_000, seconds = 30, at = 0): Sample => ({ at, cost, tokens, seconds })
const normal = [0.04, 0.05, 0.035, 0.06, 0.045, 0.05, 0.042, 0.055, 0.048, 0.039].map((c, i) => s(c, 20_000 + i * 900, 25 + i))

describe('turn anomalies', () => {
  it('median and MAD', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1)
    expect(band([10, 10, 10]).high).toBeCloseTo(15, 5)
  })
  it('small noise never alerts', () => {
    for (const c of [0.03, 0.065, 0.07, 0.08]) expect(check(normal, s(c, 26_000, 40))).toEqual([])
  })
  it('a spike alerts with its reason', () => {
    const v = check(normal, s(0.31, 21_000, 30), { where: 'acme on Sonnet' })
    expect(v).toHaveLength(1)
    expect(v[0]!.metric).toBe('cost')
    expect(v[0]!.reason).toBe('This turn cost US$ 0.31, 6.7x the usual US$ 0.046 for acme on Sonnet.')
    expect(check(normal, s(0.05, 180_000, 31)).map((x) => x.metric)).toEqual(['tokens'])
  })
  it('says nothing without enough history', () => expect(check(normal.slice(0, 5), s(9))).toEqual([]))

  it('says nothing under 10 comparable turns', () => expect(check(normal.slice(0, 9), s(9))).toEqual([]))
  it('buckets turns by shape', () => {
    expect([0, 1, 5, 6, 40].map(shapeOf)).toEqual(['chat', 'few', 'few', 'many', 'many'])
  })
  it('duration compares active time with turns of the same shape, and only when on', () => {
    const chat = Array.from({ length: 12 }, (_, i) => ({ ...s(0.05, 20_000, 10 + (i % 3), i), active: 10 + (i % 3), tools: 0 }))
    const long = { ...s(0.05, 20_000, 480), active: 120, tools: 12 }
    expect(check(chat, long, { duration: true })).toEqual([]) // no 6+ history: not comparable
    expect(check([...chat, ...chat.map((c) => ({ ...c, active: 100 + c.active, tools: 9 }))], long, { duration: true })).toEqual([])
    const slowChat = { ...s(0.05, 20_000, 200), active: 200, tools: 0 }
    expect(check(chat, slowChat).map((v) => v.metric)).toEqual([]) // off by default
    expect(check(chat, slowChat, { duration: true }).map((v) => v.metric)).toEqual(['seconds'])
  })
  it('a long but busy turn is not slow when its wall time was waiting', () => {
    const c = turnClock()
    c.event(1000, ['Read'])
    c.event(2000, ['mcp__stm__message_panel'])
    c.moved(402_000)
    c.event(403_000, [])
    c.event(404_000, [], true) // permission card
    c.moved(440_000)
    expect(c.finish(441_000, 441_000)).toEqual({ tools: 2, active: 441 - 400 - 36 })
  })
  it('at most one note per panel per 30 minutes', () => {
    expect(noteDue(undefined, 0)).toBe(true)
    expect(noteDue(0, 29 * 60_000)).toBe(false)
    expect(noteDue(0, 30 * 60_000)).toBe(true)
  })
  it('only a cost far out is a warning', () => {
    const [c] = check(normal, s(0.9))
    expect(toneOf(c!)).toBe('error')
    const [m] = check(normal, s(0.2))
    expect(m!.ratio).toBeLessThan(10)
    expect(toneOf(m!)).toBeUndefined()
    const [t] = check(normal, s(0.05, 900_000))
    expect(toneOf(t!)).toBeUndefined()
  })
})
