import { describe, expect, it } from 'vitest'
import { createBackoff } from './backoff.js'

// Deterministic randomness: a fixed sequence, cycled.
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('reconnect backoff', () => {
  it('doubles from 1s with no jitter at the midpoint', () => {
    const b = createBackoff({ random: () => 0.5 })
    expect([b.next(), b.next(), b.next(), b.next()]).toEqual([1000, 2000, 4000, 8000])
  })

  it('caps the delay at 60s', () => {
    const b = createBackoff({ random: () => 0.5, maxTries: 10 })
    const delays = [] as number[]
    for (let d = b.next(); d !== null; d = b.next()) delays.push(d)
    expect(delays.slice(0, 6)).toEqual([1000, 2000, 4000, 8000, 16000, 32000])
    expect(delays.slice(6)).toEqual([60000, 60000, 60000, 60000])
  })

  it('keeps jitter within +-20% and never above the cap', () => {
    const low = createBackoff({ random: () => 0 })
    const high = createBackoff({ random: () => 0.999999 })
    expect(low.next()).toBe(800)
    expect(high.next()).toBe(1200)
    const far = createBackoff({ random: () => 0.999999 })
    for (let i = 0; i < 6; i++) far.next()
    expect(far.next()).toBe(60000) // 60s * 1.2 clamped to the cap
    const near = createBackoff({ random: () => 0 })
    for (let i = 0; i < 6; i++) near.next()
    expect(near.next()).toBe(48000)
  })

  it('stays inside the jitter band for a seeded sequence', () => {
    const b = createBackoff({ random: seq(0.1, 0.9, 0.5, 0.25, 0.75) })
    for (let attempt = 0; attempt < 5; attempt++) {
      const raw = Math.min(60_000, 1000 * 2 ** attempt)
      const d = b.next()!
      expect(d).toBeGreaterThanOrEqual(Math.round(raw * 0.8))
      expect(d).toBeLessThanOrEqual(Math.min(60_000, Math.round(raw * 1.2)))
    }
  })

  it('gives up after maxTries and says so with null', () => {
    const b = createBackoff({ maxTries: 3, random: () => 0.5 })
    expect(b.next()).toBe(1000)
    expect(b.next()).toBe(2000)
    expect(b.next()).toBe(4000)
    expect(b.next()).toBeNull()
    expect(b.next()).toBeNull()
    expect(b.tries).toBe(3)
  })

  it('starts over after reset', () => {
    const b = createBackoff({ random: () => 0.5, maxTries: 2 })
    b.next()
    b.next()
    expect(b.next()).toBeNull()
    b.reset()
    expect(b.tries).toBe(0)
    expect(b.next()).toBe(1000)
  })

  it('honours custom base, cap and jitter', () => {
    const b = createBackoff({ baseMs: 500, capMs: 2000, jitter: 0, random: () => 0.5 })
    expect([b.next(), b.next(), b.next(), b.next()]).toEqual([500, 1000, 2000, 2000])
  })
})
