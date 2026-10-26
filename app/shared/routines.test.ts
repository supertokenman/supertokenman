import { describe, expect, it } from 'vitest'
import { checkRoutine, isDue, ROUTINE_TOOLS, routinePrompt, type Routine } from './routines'

const r: Routine = { id: 'r1', name: 'Weekly deps', cwd: '/w/acme', skill: 'deps-scan', params: 'Focus on high severity.', when: { kind: 'every', minutes: 60 }, enabled: true, armedAt: 0 }

describe('routines', () => {
  it('is due on its schedule, never when off', () => {
    expect(isDue(r, 60 * 60_000 + 1)).toBe(true)
    expect(isDue({ ...r, lastRun: 60 * 60_000 }, 61 * 60_000)).toBe(false)
    expect(isDue({ ...r, enabled: false }, 10 ** 9)).toBe(false)
  })
  it('only reads', () => {
    expect(ROUTINE_TOOLS).toEqual(['Read', 'Grep', 'Glob'])
    expect(routinePrompt(r)).toMatch(/no shell, no editing and no network[\s\S]*Use the deps-scan skill\.[\s\S]*high severity/)
  })
  it('checks what is saved', () => {
    expect(checkRoutine({ ...r, name: ' ' })).toMatch(/Name/)
    expect(checkRoutine({ ...r, when: { kind: 'every', minutes: 15 } })).toMatch(/once an hour/)
    expect(checkRoutine({ ...r, when: { kind: 'pr-review' } })).toMatch(/schedule/)
    expect(checkRoutine({ ...r, skill: '', params: '' })).toMatch(/skill/)
    expect(checkRoutine(r)).toBeNull()
  })
})
