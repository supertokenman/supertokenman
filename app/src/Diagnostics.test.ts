import { describe, expect, it } from 'vitest'
import { groupErrors } from './Diagnostics'

describe('groupErrors', () => {
  it('folds identical errors into one row with a count and the latest time', () => {
    const e = (at: string, text = 'boom') => ({ at, level: 'error', where: 'main', text }) as never
    const g = groupErrors([e('2026-01-01T10:00:00Z'), e('2026-01-01T10:05:00Z'), e('2026-01-01T10:01:00Z', 'other'), e('2026-01-01T10:02:00Z')])
    expect(g.map((x) => [x.entry.text, x.count, new Date(x.latest).toISOString()])).toEqual([
      ['boom', 3, '2026-01-01T10:05:00.000Z'],
      ['other', 1, '2026-01-01T10:01:00.000Z'],
    ])
  })
})
