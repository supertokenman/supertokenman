import { describe, expect, it } from 'vitest'
import { isLight, luminance } from '../shared/darken'

describe('darken', () => {
  it('reads computed colors', () => {
    expect(luminance('rgb(255, 255, 255)')).toBeCloseTo(1)
    expect(luminance('rgb(17, 27, 33)')).toBeLessThan(0.05)
    expect(isLight('rgba(0, 0, 0, 0)')).toBe(true)
    expect(isLight('rgb(252, 245, 235)')).toBe(true)
    expect(isLight('rgb(11, 20, 26)')).toBe(false)
  })
})
