import { describe, expect, it, vi } from 'vitest'
import { displayCurrency, formatMoney, perUsd, rateNote, readCostPref, setCostPref } from './currency'

describe('currency', () => {
  it('shows US dollars by default, even on a Mac set to Brazil', () => {
    expect(displayCurrency(['pt-BR'], 'usd')).toBe('USD')
    expect(displayCurrency(['en-US', 'pt-BR'], 'usd')).toBe('USD')
    expect(readCostPref()).toBe('usd')
  })
  it('shows reais only when local currency is chosen on a Mac set to Brazil', () => {
    expect(displayCurrency(['pt-BR'], 'local')).toBe('BRL')
    expect(displayCurrency(['en-US', 'pt-BR'], 'local')).toBe('BRL')
    expect(displayCurrency(['en-US'], 'local')).toBe('USD')
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) })
    setCostPref('local')
    expect(readCostPref()).toBe('local')
    setCostPref('usd')
    expect(readCostPref()).toBe('usd')
    vi.unstubAllGlobals()
  })
  it('states the rate and its date next to a converted total', () => {
    expect(rateNote('USD', 5.05, null)).toBe('')
    expect(rateNote('BRL', 5.05, null).replace(/\s/g, ' ')).toContain('R$ 5,05 per US$ 1, fixed rate')
    expect(rateNote('BRL', 5.2, Date.UTC(2026, 0, 2, 12))).toContain('rate of')
  })
  it('keeps the other cases', () => {
    expect(displayCurrency(['pt-PT'], 'local')).toBe('USD')
    expect(displayCurrency([], 'local')).toBe('USD')
  })
  it('converts from dollars only for reais', () => {
    expect(perUsd('USD', 5)).toBe(1)
    expect(perUsd('BRL', 5)).toBe(5)
    expect(formatMoney(1.5, 'USD', 5)).toBe('$1.50')
    expect(formatMoney(1, 'BRL', 5).replace(/\s/g, ' ')).toBe('R$ 5,00')
  })
})
