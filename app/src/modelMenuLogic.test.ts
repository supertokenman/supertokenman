import { describe, expect, it } from 'vitest'
import { effortRows, mainRows, shortcut, step, triggerLabel, validEffort } from './modelMenuLogic'

describe('model menu logic', () => {
  it('labels the trigger', () => {
    expect(triggerLabel('', '')).toBe('Default model')
    expect(triggerLabel('claude-opus-5-5', 'high')).toBe('Opus 5.5 · High')
    expect(triggerLabel('claude-haiku-4-5', 'high')).toBe('Haiku 4.5')
  })
  it('never keeps an unsupported effort', () => {
    expect(validEffort('claude-haiku-4-5', 'max')).toBe('')
    expect(validEffort('claude-opus-4-6', 'xhigh')).toBe('')
    expect(validEffort('claude-opus-4-6', 'max')).toBe('max')
    expect(effortRows('claude-opus-4-6')).toEqual(['', 'low', 'medium', 'high', 'max'])
  })
  it('hides the effort row for models without effort', () => {
    expect(mainRows('claude-haiku-4-5').some((r) => r.kind === 'effort')).toBe(false)
    expect(mainRows('claude-opus-5-5').some((r) => r.kind === 'effort')).toBe(true)
  })
  it('moves and picks by number', () => {
    expect(step(0, 3, -1)).toBe(2)
    expect(step(2, 3, 1)).toBe(0)
    const rows = mainRows('')
    expect(shortcut('1', rows)).toBe('')
    expect(shortcut('2', rows)).toBe('claude-opus-5-5')
    expect(shortcut('9', rows)).toBeNull()
    expect(shortcut('a', rows)).toBeNull()
  })
})
