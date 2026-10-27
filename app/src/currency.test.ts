import { describe, expect, it } from 'vitest'
import { displayCurrency, formatMoney, perUsd } from './currency'

describe('currency', () => {
  it('shows reais only on a Mac set to Brazil', () => {
    expect(displayCurrency(['pt-BR'])).toBe('BRL')
    expect(displayCurrency(['en-US', 'pt-BR'])).toBe('BRL')
    expect(displayCurrency(['en-US'])).toBe('USD')
    expect(displayCurrency(['pt-PT'])).toBe('USD')
    expect(displayCurrency([])).toBe('USD')
  })
  it('converts from dollars only for reais', () => {
    expect(perUsd('USD', 5)).toBe(1)
    expect(perUsd('BRL', 5)).toBe(5)
    expect(formatMoney(1.5, 'USD', 5)).toBe('$1.50')
    expect(formatMoney(1, 'BRL', 5).replace(/\s/g, ' ')).toBe('R$ 5,00')
  })
})
