import { describe, expect, it } from 'vitest'
import { band, check, mad, median, type Sample } from './anomaly'

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
})
