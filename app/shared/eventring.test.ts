import { describe, expect, it } from 'vitest'
import { EventRing } from './eventring.js'

// Sizes are injected so byte caps are exact in tests.
const ring = (opts: { maxEvents?: number; maxBytes?: number } = {}) =>
  new EventRing<{ n: number }>({ ...opts, size: (e) => (e.n === 0 ? 1 : 10) })

describe('event ring buffer', () => {
  it('keeps events in insertion order, oldest first', () => {
    const r = new EventRing<number>({ size: () => 1 })
    r.push(1)
    r.push(2)
    r.push(3)
    expect(r.toArray()).toEqual([1, 2, 3])
    expect(r.count).toBe(3)
    expect(r.bytes).toBe(3)
  })

  it('evicts the oldest once the count cap is exceeded', () => {
    const r = new EventRing<number>({ maxEvents: 3, size: () => 1 })
    for (let i = 1; i <= 5; i++) r.push(i)
    expect(r.toArray()).toEqual([3, 4, 5])
    expect(r.count).toBe(3)
  })

  it('evicts oldest events until the byte cap holds', () => {
    const r = ring({ maxBytes: 25 })
    for (let n = 1; n <= 4; n++) r.push({ n })
    // four 10-byte events exceed 25; the two oldest go
    expect(r.toArray().map((e) => e.n)).toEqual([3, 4])
    expect(r.bytes).toBe(20)
  })

  it('evicts several small events to fit one large one', () => {
    const r = new EventRing<number>({ maxBytes: 10, size: (n) => n })
    r.push(3)
    r.push(3)
    r.push(3)
    expect(r.push(9)).toBe(true)
    expect(r.toArray()).toEqual([9])
    expect(r.bytes).toBe(9)
  })

  it('refuses an event larger than the whole byte cap', () => {
    const r = new EventRing<number>({ maxBytes: 10, size: (n) => n })
    r.push(4)
    expect(r.push(11)).toBe(false)
    expect(r.toArray()).toEqual([4])
    expect(r.bytes).toBe(4)
  })

  it('defaults to 2000 events and 4 MB', () => {
    const r = new EventRing<number>({ size: () => 1 })
    for (let i = 0; i < 2005; i++) r.push(i)
    expect(r.count).toBe(2000)
    expect(r.toArray()[0]).toBe(5)

    const big = new EventRing<string>({ size: () => 1024 * 1024 })
    for (let i = 0; i < 6; i++) big.push('x')
    expect(big.count).toBe(4)
    expect(big.bytes).toBe(4 * 1024 * 1024)
  })

  it('measures default size as UTF-8 JSON length', () => {
    const r = new EventRing<{ t: string }>({ maxBytes: 1000 })
    r.push({ t: 'é' }) // {"t":"é"} is 10 bytes in UTF-8
    expect(r.bytes).toBe(10)
  })

  it('clears to empty', () => {
    const r = ring()
    r.push({ n: 1 })
    r.clear()
    expect(r.toArray()).toEqual([])
    expect(r.count).toBe(0)
    expect(r.bytes).toBe(0)
  })
})
