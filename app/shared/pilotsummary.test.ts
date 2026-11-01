import { describe, expect, it } from 'vitest'
import { COMMANDS, findCommand } from './pilotcatalog'
import { estimateTokens, line, summarize, SUMMARY_BUDGET_TOKENS } from './pilotsummary'

describe('summarize', () => {
  it('lists runnable commands only, grouped', () => {
    const s = summarize(COMMANDS)
    expect(s.text).toContain('## Go to')
    expect(s.text).toContain('- go-today: Today [free]')
    expect(s.text).not.toContain('go-worktree')
    expect(s.groups).toContain('Layout')
  })
  it('stays under the token budget for the full catalog', () => {
    const s = summarize(COMMANDS)
    expect(s.tokens).toBeLessThanOrEqual(SUMMARY_BUDGET_TOKENS)
    expect(estimateTokens(s.text)).toBe(s.tokens)
  })
  it('says how many more when the budget runs out', () => {
    const s = summarize(COMMANDS, { budgetTokens: 300 })
    expect(s.truncated).toBe(true)
    expect(s.text).toMatch(/… \d+ more, narrow with group/)
    expect(s.tokens).toBeLessThanOrEqual(300)
  })
  it('narrows to one group', () => {
    const s = summarize(COMMANDS, { group: 'layout' })
    expect(s.groups).toEqual(['Layout'])
    expect(s.text).toContain('layout-<id>')
    expect(s.text).not.toContain('go-today')
  })
  it('renders enum values and args in a line', () => {
    const l = line(findCommand('layout-grid')!.spec)
    expect(l).toContain('id=auto|grid|columns|canvas')
  })
})
