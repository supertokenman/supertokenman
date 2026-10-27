// Model prices: exact model id first (see models.ts for the table and its source), then the family's
// current model for unknown ids (dated or newer ids), then a mid model.
import { MODEL_LIST, modelById, type Family, type Price } from './models.js'

const FAMILY_FALLBACK: Record<Family, string> = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', fable: 'claude-fable-5-1' }
const MID: Price = { input: 3, output: 15, cacheRead: 0.3 }

/** The full price of a model id, with the tier that applies to a prompt of this many tokens. */
export function priceFor(model = '', promptTokens = 0): Price & { id: string } {
  const exact = modelById(model) ?? MODEL_LIST.find((m) => model.startsWith(m.id + '-')) // dated ids
  const fam = (Object.keys(FAMILY_FALLBACK) as Family[]).find((f) => model.includes(f))
  const m = exact ?? (fam ? modelById(FAMILY_FALLBACK[fam]) : undefined)
  if (!m) return { id: '', ...MID }
  const { long, ...base } = m.price
  return { id: m.id, ...(long && promptTokens > long.over ? { input: long.input, output: long.output, cacheRead: long.cacheRead } : base) }
}

/** Per million tokens: [model id, input, cache read]; unknown models price like a mid model. */
export const priceOf = (model = '', promptTokens = 0): [string, number, number] => {
  const p = priceFor(model, promptTokens)
  return [p.id, p.input, p.cacheRead]
}

