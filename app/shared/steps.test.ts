import { describe, expect, it } from 'vitest'
import { stepProgress } from './steps'

describe('stepProgress', () => {
  const steps = [{ id: 'open' }, { id: 'name', passive: true }, { id: 'copy' }, { id: 'paste', done: false }]
  it('starts at the first step', () => {
    const p = stepProgress(steps, [])
    expect(p.current).toBe('open')
    expect(p.count).toBe(0)
    expect(p.total).toBe(4)
  })
  it('ticks a step when its action happened', () => {
    const p = stepProgress(steps, ['open'])
    expect(p.done.has('open')).toBe(true)
    expect(p.current).toBe('name')
  })
  it('ticks a passive step once a later step is done', () => {
    const p = stepProgress(steps, ['open', 'copy'])
    expect(p.done.has('name')).toBe(true)
    expect(p.current).toBe('paste')
  })
  it('takes the done flag from the app (field filled, tool found)', () => {
    const p = stepProgress(steps.map((s) => (s.id === 'paste' ? { ...s, done: true } : s)), [])
    expect(p.done.has('paste')).toBe(true)
    expect(p.done.has('name')).toBe(true)
    expect(p.current).toBe('open')
    expect(stepProgress(steps.map((s) => ({ ...s, done: true })), []).current).toBeNull()
  })
  it('ignores actions of unknown steps', () => {
    expect(stepProgress(steps, ['other']).count).toBe(0)
  })
})
