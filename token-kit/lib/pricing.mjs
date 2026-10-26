// @ts-check
// Claude API list prices, USD per million tokens (Anthropic first-party rates, cached 2026-10-06).
// Cache writes cost 1.25x input (5 min TTL) or 2x input (1 h TTL). Cache reads vary by model.
// Subscription plans are not billed per token: these prices give the API value of the same work.

/**
 * @typedef {object} Price
 * @property {number} input
 * @property {number} output
 * @property {number} read   cache read
 */

/** Longest prefix wins, so `claude-opus-5-5` is checked before `claude-opus-5`. */
const TABLE = /** @type {Array<[string, Price]>} */ ([
  ['claude-fable-5-1', { input: 10, output: 50, read: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50, read: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, read: 1 }],
  ['claude-mythos-5', { input: 10, output: 50, read: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, read: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, read: 0.5 }],
  ['claude-opus-4', { input: 5, output: 25, read: 0.5 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, read: 0.2 }],
  ['claude-sonnet-5', { input: 2, output: 10, read: 0.2 }],
  ['claude-sonnet-4', { input: 3, output: 15, read: 0.3 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5, read: 0.01 }],
  ['claude-haiku-4', { input: 1, output: 5, read: 0.1 }],
]).sort((a, b) => b[0].length - a[0].length);

/** Used when the model is unknown: the current default model. */
export const DEFAULT_MODEL = 'claude-opus-5-5';

/**
 * @param {string} [model]
 * @returns {Price}
 */
export function priceFor(model) {
  const id = String(model || '').replace(/^(?:anthropic\.|us\.anthropic\.)/, '').replace(/\[.*\]$/, '');
  for (const [prefix, p] of TABLE) if (id.startsWith(prefix)) return p;
  return /** @type {Price} */ (TABLE.find(([k]) => k === DEFAULT_MODEL)?.[1]);
}

/**
 * USD cost of one request at API list price.
 * @param {any} u usage block of the response
 * @param {string} [model]
 */
export function requestUsd(u, model) {
  const p = priceFor(model);
  // fast mode costs 2x on the models that offer it
  const speed = u.speed === 'fast' ? 2 : 1;
  const cw = u.cache_creation_input_tokens || 0;
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? cw;
  const usd =
    (u.input_tokens || 0) * p.input +
    w1h * p.input * 2 +
    (cw - w1h) * p.input * 1.25 +
    (u.cache_read_input_tokens || 0) * p.read +
    (u.output_tokens || 0) * p.output;
  return (usd * speed) / 1e6;
}

/**
 * USD saved by keeping `tokens` out of the context: the cache write it avoided plus every later re-read.
 * @param {number} tokens
 * @param {number} rereads
 * @param {string} [model]
 */
export function savedUsd(tokens, rereads, model) {
  const p = priceFor(model);
  return (tokens * (p.input * 2 + p.read * rereads)) / 1e6;
}
