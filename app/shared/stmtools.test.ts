import { describe, expect, it } from 'vitest'
import { cardSummary, linkSpec, loopSpec } from './stmtools'

describe('linkSpec', () => {
  it('gives an auto link the default cap and leaves a waiting link without one', () => {
    expect(linkSpec({ a: 'api', b: 'web', auto: true })).toEqual({ a: 'api', b: 'web', auto: true, capUsd: 5 })
    expect(linkSpec({ a: 'api', b: 'web' })).toEqual({ a: 'api', b: 'web', auto: false })
  })
  it('refuses a self link and a cap out of range', () => {
    expect(() => linkSpec({ a: 'x', b: 'x' })).toThrow(/two different/)
    expect(() => linkSpec({ a: 'x', b: 'y', capUsd: 51 })).toThrow(/at most \$50/)
    expect(() => linkSpec({ a: 'x', b: 'y', capUsd: 0 })).toThrow()
  })
})

describe('loopSpec', () => {
  it('defaults to 3 rounds and $2', () => expect(loopSpec({ build: 'a', review: 'b' })).toEqual({ build: 'a', review: 'b', rounds: 3, maxUsd: 2 }))
  it('refuses the same panel twice, bad rounds and a cap over $50', () => {
    expect(() => loopSpec({ build: 'a', review: 'a' })).toThrow()
    expect(() => loopSpec({ build: 'a', review: 'b', rounds: 11 })).toThrow(/1 to 10/)
    expect(() => loopSpec({ build: 'a', review: 'b', maxUsd: 60 })).toThrow(/\$50/)
  })
})

describe('cardSummary', () => {
  it('shows the cap on the loop and link cards', () => {
    expect(cardSummary('mcp__stm__loop_start', { build: 'api', review: 'rev' })).toBe('review loop: api builds, rev reviews, up to 3 rounds, stops at $2.00')
    expect(cardSummary('mcp__stm__link', { a: 'a', b: 'b', auto: true })).toContain('cap $5.00 a day')
  })
  it('says triggers come in off, and ignores other tools', () => {
    expect(cardSummary('mcp__stm__trigger_create', { name: 'Nightly', panel: 'api', when: 'Every day at 02:00' })).toContain('turned off')
    expect(cardSummary('Bash', { command: 'ls' })).toBeNull()
    expect(cardSummary('mcp__stm__manual', { topic: 'x' })).toBeNull()
  })
})
