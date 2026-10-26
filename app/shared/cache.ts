// The prompt cache: Anthropic keeps the start of a conversation for a while after each use (five
// minutes or an hour, as the account and Claude Code set it). Within that time a turn re-reads it at
// a tenth of the price; after it lapses, the next turn writes the whole context again at 1.25x.
import { priceOf } from './prices.js'

export const FIVE_MIN = 5 * 60_000
export const ONE_HOUR = 60 * 60_000

/** The time to live a turn's cache writes used; when the turn wrote nothing, the one known before. */
export function ttlOf(written?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null, before?: number): number | undefined {
  if ((written?.ephemeral_1h_input_tokens ?? 0) > 0) return ONE_HOUR
  if ((written?.ephemeral_5m_input_tokens ?? 0) > 0) return FIVE_MIN
  return before
}

/** Milliseconds left before the cache lapses; 0 once it has. Each turn, read or write, starts it over. */
export const cacheLeft = (lastTurnAt: number, ttl: number, now = Date.now()) => Math.max(0, lastTurnAt + ttl - now)

/** What re-sending a context of this size costs beyond reading it warm. */
export function coldExtraUsd(tokens: number, model = '') {
  const [, input, cached] = priceOf(model)
  return (tokens * (input * 1.25 - cached)) / 1e6
}
