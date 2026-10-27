import { describe, expect, it } from 'vitest'
import { rangeOf } from './windowed'

describe('rangeOf', () => {
  const h = [100, 100, 100, 100, 100]
  it('draws the items that cross the band', () => expect(rangeOf(h, 150, 260)).toEqual({ start: 1, end: 3 }))
  it('draws from the top when the band starts above it', () => expect(rangeOf(h, -500, 50)).toEqual({ start: 0, end: 1 }))
  it('draws to the end when the band reaches past it', () => expect(rangeOf(h, 420, 2000)).toEqual({ start: 4, end: 5 }))
  it('draws nothing of an empty list', () => expect(rangeOf([], 0, 100)).toEqual({ start: 0, end: 0 }))
})
