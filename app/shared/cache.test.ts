import { describe, expect, it } from 'vitest'
import { cacheLeft, coldExtraUsd, FIVE_MIN, ONE_HOUR, ttlOf } from './cache'

describe('prompt cache', () => {
  it('reads the time to live from what a turn wrote, keeping the last known one', () => {
    expect(ttlOf({ ephemeral_1h_input_tokens: 570, ephemeral_5m_input_tokens: 0 })).toBe(ONE_HOUR)
    expect(ttlOf({ ephemeral_5m_input_tokens: 9 })).toBe(FIVE_MIN)
    expect(ttlOf({}, ONE_HOUR)).toBe(ONE_HOUR)
    expect(ttlOf(undefined)).toBeUndefined()
  })
  it('counts down from the last turn and stops at zero', () => {
    expect(cacheLeft(1000, FIVE_MIN, 1000 + 60_000)).toBe(4 * 60_000)
    expect(cacheLeft(1000, FIVE_MIN, 1000 + FIVE_MIN + 1)).toBe(0)
  })
  it('prices a cold turn as a write at 1.25x input minus the warm read', () => {
    expect(coldExtraUsd(1_000_000, 'claude-haiku-4-5')).toBeCloseTo(1.15)
    expect(coldExtraUsd(100_000, 'claude-opus-5-5')).toBeCloseTo(0.48)
  })
})
