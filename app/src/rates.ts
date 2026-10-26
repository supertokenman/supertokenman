import { useEffect, useState } from 'react'

// Exchange rates in BRL per unit. A fixed rate ships with the app; the day's rate is fetched from
// frankfurter.dev only when the person asks (Update rates), and kept on this Mac.
export type Rates = { USD: number; EUR: number; at: number | null }

export const FIXED_RATES: Rates = { USD: 5.05, EUR: 5.5, at: null }
const KEY = 'stm.rates'
const EVENT = 'stm-rates'

export function readRates(): Rates {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Rates | null
    if (r && r.USD > 0 && r.EUR > 0) return r
  } catch {
    // storage blocked or broken: the fixed rate
  }
  return FIXED_RATES
}

/** Fetches the day's rates; throws when they did not come, so the caller can say so. */
export async function updateRates(get: typeof fetch = fetch): Promise<Rates> {
  const r = await get('https://api.frankfurter.dev/v1/latest?base=BRL&symbols=USD,EUR')
  const j = (await r.json()) as { rates?: Record<string, number> }
  const usd = 1 / (j.rates?.USD ?? NaN)
  const eur = 1 / (j.rates?.EUR ?? NaN)
  if (!Number.isFinite(usd) || !Number.isFinite(eur) || usd <= 0 || eur <= 0) throw new Error('The rates did not come.')
  const next: Rates = { USD: usd, EUR: eur, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // kept for this session only
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  return next
}

/** The rates in use, following updates made anywhere in the window. */
export function useRates(): Rates {
  const [rates, setRates] = useState(readRates)
  useEffect(() => {
    const on = (e: Event) => setRates((e as CustomEvent<Rates>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return rates
}

export const ratesLabel = (r: Rates) => (r.at ? `Rates from ${new Date(r.at).toLocaleDateString()}` : 'Fixed rates')
