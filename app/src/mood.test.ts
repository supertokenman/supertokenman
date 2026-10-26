import { describe, expect, it } from 'vitest'
import { moodOf } from './mood'
import { initial, type State } from './state'

const at = (s: Partial<State>): State => ({ ...initial, ...s })
const NOW = 10_000_000

describe('mood', () => {
  it('reads the session', () => {
    expect(moodOf(at({}), NOW)).toBe('idle')
    expect(moodOf(at({ busy: true }), NOW)).toBe('working')
    expect(moodOf(at({ busy: true }), NOW, { focus: true })).toBe('focus')
    expect(moodOf(at({ asleep: true }), NOW)).toBe('sleep')
    expect(moodOf(at({ cuts: [{ tokens: 1, at: NOW - 1000, cmd: '' }] }), NOW)).toBe('joy')
    expect(moodOf(at({ cuts: [{ tokens: 1, at: NOW - 9000, cmd: '' }] }), NOW)).toBe('idle')
    expect(moodOf(at({ exposures: [{ kind: 'exposure', name: 'X', secretKind: 'k', where: 'assistant', at: NOW - 5000 }] }), NOW)).toBe('anger')
    expect(moodOf(at({ lines: [{ kind: 'note', text: 'boom', tone: 'error' }] }), NOW)).toBe('anger')
    expect(moodOf(at({ context: { tokens: 170000, window: 200000, percent: 85 } }), NOW)).toBe('fear')
    expect(moodOf(at({ limits: { five_hour: { percentUsed: 93 } } }), NOW)).toBe('fear')
    expect(moodOf(at({ lines: [{ kind: 'shell', id: 'a', command: 'cat big.log', out: 'x'.repeat(60000), code: 0, ms: 1, running: false }] }), NOW)).toBe('disgust')
    expect(moodOf(at({ lastTurnAt: NOW - 2 * 3600_000, context: { tokens: 50000, window: 200000, percent: 25 } }), NOW)).toBe('sadness')
  })

  it('lets a fresh K.O. win over trouble', () => {
    expect(moodOf(at({ cuts: [{ tokens: 1, at: NOW - 100, cmd: '' }], context: { tokens: 1, window: 1, percent: 95 } }), NOW)).toBe('joy')
  })

  it('cheers a green run and fumes at a red one', () => {
    expect(moodOf(at({ ciDone: [{ conclusion: 'success', at: NOW - 1000, workflow: 'CI' }] }), NOW)).toBe('joy')
    expect(moodOf(at({ ciDone: [{ conclusion: 'failure', at: NOW - 10_000, workflow: 'CI' }] }), NOW)).toBe('anger')
    expect(moodOf(at({ ciDone: [{ conclusion: 'failure', at: NOW - 120_000, workflow: 'CI' }] }), NOW)).toBe('idle')
  })
})
