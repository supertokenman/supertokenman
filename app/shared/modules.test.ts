import { describe, expect, it } from 'vitest'
import { hiddenBy, MODULES } from './modules'

describe('modules', () => {
  it('has unique ids and no command in two modules', () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length)
    const all = MODULES.flatMap((m) => m.commands)
    expect(new Set(all).size).toBe(all.length)
  })
  it('hides only the commands of modules that are off', () => {
    const h = hiddenBy(['money'])
    expect(h.has('backtest')).toBe(true)
    expect(h.has('mail')).toBe(false)
    expect(hiddenBy([]).size).toBe(0)
  })
})
