import { describe as suite, expect, it } from 'vitest'
import { describe, type When } from './triggers'
import { parseWhen } from './teamwhen'

suite('parseWhen', () => {
  it('reads back what describe writes', () => {
    for (const w of [
      { kind: 'every', minutes: 30 },
      { kind: 'every', minutes: 120 },
      { kind: 'pr-review' },
      { kind: 'schedule', days: [1, 2, 3, 4, 5], time: '09:00' },
      { kind: 'schedule', days: [0, 6], time: '18:30' },
      { kind: 'schedule', days: [0, 1, 2, 3, 4, 5, 6], time: '03:00' },
      { kind: 'schedule', days: [1, 3], time: '07:15' },
    ] as When[]) expect(parseWhen(describe(w))).toEqual(w)
  })
  it('refuses anything else', () => {
    for (const t of ['', '0 3 * * *', 'Every 7 min', 'Mon at 25:00', 'Funday at 09:00']) expect(parseWhen(t)).toBeNull()
  })
})
