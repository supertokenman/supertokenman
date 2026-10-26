import { describe, expect, it } from 'vitest'
import { noPanels, reducePanels } from './state'

describe('panels', () => {
  it('opens, routes events to the right panel, and moves focus on close', () => {
    let p = reducePanels(noPanels, { kind: 'open', sid: 's1', cwd: '/api', model: '' })
    p = reducePanels(p, { kind: 'open', sid: 's2', cwd: '/web', model: 'claude-haiku-5-5' })
    expect(p.order).toEqual(['s1', 's2'])
    expect(p.focus).toBe('s2')
    p = reducePanels(p, { kind: 'event', sid: 's1', action: { kind: 'delta', text: 'hi' } })
    expect(p.byId.s1!.streaming).toBe('hi')
    expect(p.byId.s2!.streaming).toBe('')
    p = reducePanels(p, { kind: 'focus', sid: 's1' })
    p = reducePanels(p, { kind: 'close', sid: 's1' })
    expect(p.order).toEqual(['s2'])
    expect(p.focus).toBe('s2')
    // a late event for a closed panel changes nothing
    expect(reducePanels(p, { kind: 'event', sid: 's1', action: { kind: 'delta', text: 'x' } })).toBe(p)
  })
})
