import { useRates } from './rates'

// Costs come in US dollars. They show in reais on a Mac set to Brazil and in dollars everywhere else, so
// nobody outside Brazil reads R$ for an API priced in dollars.
export type Currency = 'BRL' | 'USD'

export function displayCurrency(langs: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Currency {
  return langs.some((l) => /-BR$/i.test(l)) ? 'BRL' : 'USD'
}

/** How many units of `code` one US dollar is. */
export const perUsd = (code: Currency, usdToBrl: number) => (code === 'BRL' ? usdToBrl : 1)

export const symbolOf = (code: Currency) => (code === 'BRL' ? 'R$' : 'US$')

export function formatMoney(usd: number, code: Currency, usdToBrl: number, digits = 2) {
  return new Intl.NumberFormat(code === 'BRL' ? 'pt-BR' : 'en-US', { style: 'currency', currency: code, maximumFractionDigits: digits }).format(usd * perUsd(code, usdToBrl))
}

/** The currency in use and the rate to it from US dollars. */
export function useMoney() {
  const code = displayCurrency()
  const rate = perUsd(code, useRates().USD)
  return { code, rate, symbol: symbolOf(code) }
}
