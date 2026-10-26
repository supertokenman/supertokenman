import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FIXED_RATES, readRates, updateRates } from './rates'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
  vi.stubGlobal('window', { dispatchEvent: () => true })
  vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init?: unknown) {} })
})

const reply = (body: unknown) => (async () => ({ json: async () => body })) as unknown as typeof fetch

describe('rates', () => {
  it('starts from the fixed rate, with no network', () => {
    expect(readRates()).toEqual(FIXED_RATES)
  })

  it('keeps the day rate once asked for', async () => {
    const r = await updateRates(reply({ rates: { USD: 0.2, EUR: 0.16 } }))
    expect(r.USD).toBeCloseTo(5)
    expect(r.EUR).toBeCloseTo(6.25)
    expect(readRates().at).toBe(r.at)
  })

  it('throws and keeps the old rate when the reply is bad', async () => {
    await expect(updateRates(reply({ rates: {} }))).rejects.toThrow()
    expect(readRates()).toEqual(FIXED_RATES)
  })
})
