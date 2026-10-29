import { describe, expect, it } from 'vitest'
import { TERSE_LINE, tersed } from './terse'

describe('tersed', () => {
  it('adds the line once, at the end', () => {
    const t = tersed('Review this.', true)
    expect(t).toBe(`Review this.\n\n${TERSE_LINE}`)
    expect(tersed(t, true)).toBe(t)
  })
  it('leaves the text alone when off', () => expect(tersed('Review this.', false)).toBe('Review this.'))
})
