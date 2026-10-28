import { describe, expect, it } from 'vitest'
import { newLoop, next } from './reviewloop'

const names = { build: 'api', review: 'reviewer' }

describe('review loop', () => {
  it('passes the build reply to the reviewer and the review back, until APPROVED', () => {
    let l = newLoop('s1', 's2', 3, 2)
    let r = next(l, 's1', 'Added the endpoint.', 0.1, names)
    expect(r.step).toEqual({ send: { to: 's2', text: expect.stringContaining('Added the endpoint.') } })
    r = next(r.loop, 's2', '1. Missing a test.', 0.05, names)
    expect(r.step).toEqual({ send: { to: 's1', text: expect.stringMatching(/^Review 1 of 3 from panel reviewer/) } })
    r = next(r.loop, 's1', 'Test added, npm test passes.', 0.1, names)
    r = next(r.loop, 's2', '**APPROVED**\nLooks right.', 0.05, names)
    expect(r.step).toEqual({ stop: 'Approved by reviewer in round 2.' })
    l = r.loop
    expect(l.spentUsd).toBeCloseTo(0.3)
  })
  it('stops at the round limit and at the spend cap', () => {
    let r = next(newLoop('s1', 's2', 1, 2), 's2', 'Fix the bug.', 0.1, names)
    expect(r.step).toEqual({ stop: expect.stringMatching(/after 1 rounds/) })
    r = next(newLoop('s1', 's2', 5, 0.5), 's1', 'Done.', 0.6, names)
    expect(r.step).toEqual({ stop: expect.stringMatching(/spend cap: \$0\.60 of \$0\.50/) })
  })
  it('refuses a loop with itself or out of range limits', () => {
    expect(() => newLoop('s1', 's1')).toThrow(/two different panels/)
    expect(() => newLoop('s1', 's2', 0)).toThrow(/Rounds/)
    expect(() => newLoop('s1', 's2', 3, 100)).toThrow(/Spend cap/)
  })
})
