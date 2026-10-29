import { describe, expect, it } from 'vitest'
import { normHandle, preFilter } from './triage'

describe('triage pre-filters', () => {
  it('flags a link-only mention', () => {
    expect(preFilter({ author: '@a', text: '@me https://example.com/x' })).toBe('link only')
    expect(preFilter({ author: '@a', text: '@me see www.spam.io' })).toBe('link only')
    expect(preFilter({ author: '@a', text: '@me thanks a lot www.spam.io' })).toBeNull()
  })

  it('keeps a mention that has words next to a link', () => {
    expect(preFilter({ author: '@a', text: '@me could you summarize https://example.com/x' })).toBeNull()
  })

  it('flags repeated characters', () => {
    expect(preFilter({ author: '@a', text: '@me wooooooooooow' })).toBe('repeated characters')
    expect(preFilter({ author: '@a', text: '@me!!!!!!!!!!' })).toBe('repeated characters')
    expect(preFilter({ author: '@a', text: '@me so good, loved it' })).toBeNull()
  })

  it('flags known spam phrases', () => {
    expect(preFilter({ author: '@a', text: '@me CRYPTO GIVEAWAY, dm me for details' })).toBe('spam phrase')
    expect(preFilter({ author: '@a', text: '@me nice post' })).toBeNull()
  })

  it('flags muted handles, ignoring case, @ and the Mastodon host', () => {
    expect(preFilter({ author: '@Troll.bsky.social', text: '@me hi' }, ['troll.bsky.social'])).toBe('muted')
    expect(preFilter({ author: 'bot@masto.example', text: '@me hi' }, ['@BOT@masto.example'])).toBe('muted')
    expect(preFilter({ author: '@friend', text: '@me hi' }, ['troll'])).toBeNull()
  })

  it('normalises handles', () => {
    expect(normHandle('  @@Name ')).toBe('name')
  })
})
