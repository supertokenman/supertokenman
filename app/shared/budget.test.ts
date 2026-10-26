import { describe, expect, it } from 'vitest'
import { addSpend, checkBudget, emptySpend, estimateTurn } from './budget'

const DAY = '2026-10-24'

describe('budget', () => {
  it('adds spend by project and persona, and starts over on a new day', () => {
    let s = addSpend(emptySpend(DAY), DAY, '/a', 'reviewer', 0.5)
    s = addSpend(s, DAY, '/a', undefined, 0.25)
    expect(s.project['/a']).toBe(0.75)
    expect(s.persona.reviewer).toBe(0.5)
    expect(addSpend(s, '2026-10-25', '/a', undefined, 0.1)).toEqual({ day: '2026-10-25', project: { '/a': 0.1 }, persona: {} })
  })
  it('estimates the next turn from the median of recent ones', () => {
    expect(estimateTurn([])).toBe(0)
    expect(estimateTurn([0.1, 0.2, 5])).toBe(0.2)
    expect(estimateTurn([0.1, 0.3])).toBeCloseTo(0.2)
  })
  it('lets a message go with no limits set', () => {
    expect(checkBudget({}, emptySpend(DAY), DAY, { project: '/a', panelUsd: 99, estimateUsd: 9 })).toEqual({ ok: true })
  })
  it('holds a message that would cross the panel limit', () => {
    const v = checkBudget({ panelUsd: 1 }, emptySpend(DAY), DAY, { project: '/a', panelUsd: 0.9, estimateUsd: 0.2 })
    expect(v).toMatchObject({ ok: false, scope: 'panel', limit: 1 })
  })
  it('holds on the project and persona limits of today only', () => {
    const s = addSpend(emptySpend(DAY), DAY, '/a', 'writer', 4.9)
    expect(checkBudget({ projectDayUsd: 5 }, s, DAY, { project: '/a', panelUsd: 0, estimateUsd: 0.2 })).toMatchObject({ ok: false, scope: 'project' })
    expect(checkBudget({ personaDayUsd: 5 }, s, DAY, { project: '/b', persona: 'writer', panelUsd: 0, estimateUsd: 0.2 })).toMatchObject({ ok: false, scope: 'persona' })
    // yesterday's spend does not count
    expect(checkBudget({ projectDayUsd: 5 }, s, '2026-10-25', { project: '/a', panelUsd: 0, estimateUsd: 0.2 })).toEqual({ ok: true })
  })
  it('asks first for a turn expected to cost more than the threshold', () => {
    expect(checkBudget({ approveTurnUsd: 0.5 }, emptySpend(DAY), DAY, { project: '/a', panelUsd: 0, estimateUsd: 0.8 })).toMatchObject({ ok: false, scope: 'turn' })
  })
  it('warns near a limit without holding', () => {
    const v = checkBudget({ panelUsd: 1 }, emptySpend(DAY), DAY, { project: '/a', panelUsd: 0.85, estimateUsd: 0.05 })
    expect(v.ok).toBe(true)
    expect(v.ok && v.warn).toMatch(/85% of the budget for this panel/)
  })
})
