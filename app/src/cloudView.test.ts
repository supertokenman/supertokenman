import { describe, expect, it } from 'vitest'
import { daysSince, forgotten, summary } from './cloudView'

const now = Date.parse('2026-10-23T00:00:00Z')
const r = (state: 'running' | 'stopped', since: string, region = 'us-east-1') => ({ provider: 'AWS', kind: 'EC2', name: 'x', region, state, since, console: '' })

describe('cloud view', () => {
  it('counts days and spots forgotten machines', () => {
    expect(daysSince('2026-10-01T00:00:00Z', now)).toBe(22)
    expect(daysSince(undefined, now)).toBeNull()
    expect(forgotten(r('running', '2026-09-01T00:00:00Z'), now)).toBe(true)
    expect(forgotten(r('running', '2026-10-20T00:00:00Z'), now)).toBe(false)
    expect(forgotten(r('stopped', '2026-01-01T00:00:00Z'), now)).toBe(false)
    expect(forgotten(r('running', '2026-01-01T00:00:00Z', 'local'), now)).toBe(false)
  })
  it('summarizes', () => {
    expect(summary([{ provider: 'AWS', resources: [r('running', '2026-01-01T00:00:00Z'), r('stopped', '')] }, { provider: 'Fly.io', resources: [], missing: 'flyctl' }], now)).toEqual({ running: 1, stopped: 1, forgotten: 1, connected: 1 })
  })
})
