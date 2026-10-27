import { describe, expect, it } from 'vitest'
import { suggest, tierOf } from './modelroute'

describe('model router', () => {
  it('suggests lighter models for light work, with the saving', () => {
    const s = suggest('rename getUser to fetchUser in api.ts', 'opus', 50_000)!
    expect(s).toMatchObject({ tier: 'haiku', costsMore: false })
    expect(s.why).toMatch(/rename/)
    expect(s.deltaUsd).toBeCloseTo(-0.195, 4) // (0.10 - 4) per M on 50K
  })
  it('suggests the strongest only with a reason, flagged as costing more', () => {
    expect(suggest('we need a migration plan from REST to gRPC with trade-offs', 'sonnet', 10_000)).toMatchObject({ tier: 'opus', costsMore: true })
  })
  it('stays quiet when the current model fits or the text is short', () => {
    expect(suggest('add a login page with validation', 'sonnet', 0)).toBeNull()
    expect(suggest('ok', 'opus', 0)).toBeNull()
  })
  it('lets arena picks keep a kind on the stronger model', () => {
    const tally = { summarize: { local: 0, claude: 3, tie: 0 } }
    expect(suggest('summarize this thread for me please', 'sonnet', 0, tally)).toBeNull()
    expect(suggest('summarize this thread for me please', 'haiku', 0, tally)).toMatchObject({ tier: 'sonnet', costsMore: true })
  })
  it('reads the tier of a model id', () => {
    expect(tierOf('claude-haiku-5-5')).toBe('haiku')
    expect(tierOf(null)).toBe('sonnet')
  })
})
