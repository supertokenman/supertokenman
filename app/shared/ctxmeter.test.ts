import { describe, expect, it } from 'vitest'
import { add, detail, label, range, total, type Meter } from './ctxmeter'

describe('context meter', () => {
  it('adds per layer and never counts a layer twice', () => {
    let m: Meter = {}
    m = add(m, 'compactor', 1200)
    m = add(m, 'scripts', 30_000)
    m = add(m, 'compactor', 300)
    m = add(m, 'reread', -5)
    m = add(m, 'condenser', Number.NaN)
    expect(m).toEqual({ compactor: 1500, scripts: 30_000 })
    expect(total(m)).toBe(31_500)
  })
  it('shows a range, not one number', () => {
    expect(range(1000)).toEqual([850, 1150])
    expect(label({ scripts: 10_000 })).toBe('8.5k–12k kept out')
    expect(label({})).toBe('')
    expect(detail({ compactor: 400, scripts: 2000 })).toEqual(['Compactor: 340–460 tokens', 'Scripts: 1.7k–2.3k tokens'])
  })
})
