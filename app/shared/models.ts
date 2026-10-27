// The models Claude Code offers, in its own order: the main list, then "More models".
// Prices: Anthropic first-party list prices, USD per million tokens, as cached 2026-10-06.
// Where Anthropic lists no cache-read price, it is derived as 10% of input (the standard rate).

export type Family = 'opus' | 'sonnet' | 'haiku' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Price = {
  input: number
  output: number
  cacheRead: number
  /** A higher rate once the prompt passes `over` tokens (Haiku 5.5). */
  long?: { over: number; input: number; output: number; cacheRead: number }
}
export type Model = { id: string; label: string; family: Family; generation: string; more: boolean; price: Price; efforts: Effort[]; defaultEffort?: Effort }

const ALL: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const NO_X: Effort[] = ['low', 'medium', 'high', 'max']
const p = (input: number, output: number, cacheRead = input / 10): Price => ({ input, output, cacheRead })

export const MODEL_LIST: Model[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', family: 'opus', generation: '5.5', more: false, price: p(4, 20, 0.2), efforts: ALL, defaultEffort: 'medium' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', family: 'fable', generation: '5.1', more: false, price: p(10, 50, 0.25), efforts: ALL, defaultEffort: 'high' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', family: 'sonnet', generation: '5.5', more: false, price: p(2, 10, 0.2), efforts: ALL, defaultEffort: 'high' },
  {
    id: 'claude-haiku-5-5', label: 'Haiku 5.5', family: 'haiku', generation: '5.5', more: false, efforts: ALL, defaultEffort: 'medium',
    // cache reads derived (10% of input) for both tiers
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, long: { over: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 } },
  },
  // derived cache reads (10% of input) for every model below
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', family: 'haiku', generation: '4.5', more: true, price: p(1, 5), efforts: [] },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', family: 'sonnet', generation: '5', more: true, price: p(2, 10), efforts: ALL, defaultEffort: 'high' },
  { id: 'claude-opus-5', label: 'Opus 5', family: 'opus', generation: '5', more: true, price: p(5, 25), efforts: ALL, defaultEffort: 'high' },
  { id: 'claude-fable-5', label: 'Fable 5', family: 'fable', generation: '5', more: true, price: p(10, 50), efforts: ALL, defaultEffort: 'high' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', family: 'opus', generation: '4.8', more: true, price: p(5, 25), efforts: ALL, defaultEffort: 'high' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7', family: 'opus', generation: '4.7', more: true, price: p(5, 25), efforts: ALL, defaultEffort: 'high' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', family: 'opus', generation: '4.6', more: true, price: p(5, 25), efforts: NO_X, defaultEffort: 'high' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', family: 'sonnet', generation: '4.6', more: true, price: p(3, 15), efforts: NO_X, defaultEffort: 'high' },
]

export const MAIN_MODELS = MODEL_LIST.filter((m) => !m.more)
export const MORE_MODELS = MODEL_LIST.filter((m) => m.more)
export const modelById = (id?: string | null) => MODEL_LIST.find((m) => m.id === id)
export const modelLabel = (id: string) => modelById(id)?.label ?? id
/** Effort levels a model takes; an unknown or default model gets them all. */
export const effortsOf = (id?: string | null): Effort[] => modelById(id)?.efforts ?? ALL
