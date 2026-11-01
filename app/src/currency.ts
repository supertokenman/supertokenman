import { useRates } from './rates'

import { useEffect, useState } from 'react'

// Costs come in US dollars, which is what the API bills in, and show in dollars. A person on a Mac set to
// Brazil can choose "Local currency" in Settings; then totals are converted at a stated rate and date.
export type Currency = 'BRL' | 'USD'
export type CostPref = 'usd' | 'local'

const KEY = 'stm.costs'
const EVENT = 'stm-costs'

export function readCostPref(): CostPref {
  try {
    return localStorage.getItem(KEY) === 'local' ? 'local' : 'usd'
  } catch {
    return 'usd'
  }
}

export function setCostPref(p: CostPref) {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    // storage off: it holds for this session only
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: p }))
}

/** Dollars unless the person chose local currency and the system language has one we convert to. */
export function displayCurrency(
  langs: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language],
  pref: CostPref = readCostPref(),
): Currency {
  return pref === 'local' && langs.some((l) => /-BR$/i.test(l)) ? 'BRL' : 'USD'
}

/** How many units of `code` one US dollar is. */
export const perUsd = (code: Currency, usdToBrl: number) => (code === 'BRL' ? usdToBrl : 1)

export const symbolOf = (code: Currency) => (code === 'BRL' ? 'R$' : 'US$')

export function formatMoney(usd: number, code: Currency, usdToBrl: number, digits = 2) {
  return new Intl.NumberFormat(code === 'BRL' ? 'pt-BR' : 'en-US', { style: 'currency', currency: code, maximumFractionDigits: digits }).format(usd * perUsd(code, usdToBrl))
}

/** The note that goes next to a converted total: the rate and its date. Empty in dollars. */
export function rateNote(code: Currency, usdToBrl: number, at: number | null) {
  if (code === 'USD') return ''
  const rate = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usdToBrl)
  return `Converted at R$ ${rate} per US$ 1, ${at ? `rate of ${new Date(at).toLocaleDateString()}` : 'fixed rate shipped with the app'}. An estimate, not the bill.`
}

/** The preference, following changes made anywhere in the window. */
export function useCostPref(): CostPref {
  const [p, setP] = useState(readCostPref)
  useEffect(() => {
    const on = (e: Event) => setP((e as CustomEvent<CostPref>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return p
}

/** The currency in use, the rate to it from US dollars and the note that says how it was converted. */
export function useMoney() {
  const pref = useCostPref()
  const rates = useRates()
  const code = displayCurrency(undefined, pref)
  const rate = perUsd(code, rates.USD)
  return { code, rate, symbol: symbolOf(code), note: rateNote(code, rates.USD, rates.at) }
}
