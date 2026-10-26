/** Per million tokens: [input, cache read]; unknown models price like a mid model. */
const PRICES: [string, number, number][] = [
  ['opus', 5, 0.5],
  ['sonnet', 3, 0.3],
  ['haiku', 1, 0.1],
]
export const priceOf = (model = '') => PRICES.find(([m]) => model.includes(m)) ?? ['', 3, 0.3]

