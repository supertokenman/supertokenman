import { describe, expect, it } from 'vitest'
import { capCard, CAP_TOOLS } from '../shared/capcard'
import { LEGACY_ACTIONS_RULE, LEGACY_GUIDE, STM_ASKED_TOOLS, STM_OPEN_TOOLS } from './guide'

describe('the tools a panel may call alone', () => {
  it('split the card\'s tools in two: those with their own review and those asked in the panel', () => {
    expect([...STM_OPEN_TOOLS, ...STM_ASKED_TOOLS].sort()).toEqual([...CAP_TOOLS].sort())
    expect(STM_ASKED_TOOLS).toEqual(['mcp__stm__panels_open', 'mcp__stm__link', 'mcp__stm__loop_start', 'mcp__stm__trigger_create'])
  })
})

describe('the appended text', () => {
  it('is the same on every call, with nothing that changes between turns', () => {
    expect(capCard()).toBe(capCard())
    expect(capCard()).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{10,}/)
  })
  it('keeps the old guide for the bench variant only', () => {
    expect(LEGACY_GUIDE).toContain('SuperTokenMan, the app you run in')
    expect(LEGACY_ACTIONS_RULE).toContain('stm ask test')
  })
})
