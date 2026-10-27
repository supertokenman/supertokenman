import { describe, expect, it } from 'vitest'
import { matchOptions } from './Combobox'
import { validWhen } from './controls'
import { nextEnabled } from './Select'
import { textOf, valueEvent } from './shared'

describe('own controls', () => {
  it('validates dates and times the way the native inputs hand them over', () => {
    expect(validWhen('date', '2026-10-27')).toBe(true)
    expect(validWhen('date', '2026-02-30')).toBe(false)
    expect(validWhen('date', '27/10/2026')).toBe(false)
    expect(validWhen('time', '09:05')).toBe(true)
    expect(validWhen('time', '24:00')).toBe(false)
    expect(validWhen('datetime', '2026-10-27 18:30')).toBe(true)
    expect(validWhen('datetime', '2026-10-27T18:30')).toBe(true)
    expect(validWhen('date', '')).toBe(true)
  })
  it('skips disabled rows and wraps', () => {
    const rows = [{ disabled: false }, { disabled: true }, { disabled: false }]
    expect(nextEnabled(rows, 0, 1)).toBe(2)
    expect(nextEnabled(rows, 2, 1)).toBe(0)
    expect(nextEnabled(rows, 0, -1)).toBe(2)
    expect(nextEnabled(rows, -1, 1)).toBe(0)
  })
  it('suggests starts-with before contains, not the exact text', () => {
    const o = ['beta', 'alpha', 'alphabet', 'gamma'].map((value) => ({ value }))
    expect(matchOptions(o, 'alp').map((x) => x.value)).toEqual(['alpha', 'alphabet'])
    expect(matchOptions(o, 'ma').map((x) => x.value)).toEqual(['gamma'])
    expect(matchOptions(o, 'alpha').map((x) => x.value)).toEqual(['alphabet'])
  })
  it('hands onChange the shape handlers read', () => {
    const e = valueEvent('x', { id: 'a' })
    expect(e.target.value).toBe('x')
    expect(e.currentTarget.id).toBe('a')
    expect(textOf(['Opus ', 4, null])).toBe('Opus 4')
  })
})
