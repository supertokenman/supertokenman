import { describe, expect, it } from 'vitest'
import { priceFor, priceOf } from './prices'
import { MODEL_LIST, effortsOf } from './models'

describe('model prices', () => {
  it('prices exact ids from the table', () => {
    expect(priceOf('claude-opus-5-5')).toEqual(['claude-opus-5-5', 4, 0.2])
    expect(priceOf('claude-fable-5-1')).toEqual(['claude-fable-5-1', 10, 0.25])
    expect(priceOf('claude-sonnet-5-5')).toEqual(['claude-sonnet-5-5', 2, 0.2])
    expect(priceOf('claude-sonnet-4-6')[1]).toBe(3)
    expect(priceOf('claude-opus-4-6')[1]).toBe(5)
    expect(priceOf('claude-haiku-4-5')).toEqual(['claude-haiku-4-5', 1, 0.1])
    expect(priceFor('claude-fable-5').output).toBe(50)
  })
  it('tiers Haiku 5.5 by prompt size', () => {
    expect(priceFor('claude-haiku-5-5', 100_000)).toMatchObject({ input: 0.1, output: 0.5 })
    expect(priceFor('claude-haiku-5-5', 100_001)).toMatchObject({ input: 0.5, output: 2.5 })
  })
  it('falls back by family, then to a mid model', () => {
    expect(priceOf('claude-opus-4-6-20260101')[0]).toBe('claude-opus-4-6')
    expect(priceOf('claude-opus-9')[0]).toBe('claude-opus-5-5')
    expect(priceOf('mystery')).toEqual(['', 3, 0.3])
  })
  it('lists effort levels per model', () => {
    expect(MODEL_LIST.filter((m) => !m.more).map((m) => m.label)).toEqual(['Opus 5.5', 'Fable 5.1', 'Sonnet 5.5', 'Haiku 5.5'])
    expect(effortsOf('claude-sonnet-4-6')).not.toContain('xhigh')
    expect(effortsOf('claude-haiku-4-5')).toEqual([])
    expect(effortsOf('')).toContain('xhigh')
  })
})
