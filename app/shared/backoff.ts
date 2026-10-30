// Reconnect backoff for remote panels: 1s, 2s, 4s ... capped at 60s, +-20% jitter, then give up.
// Randomness is injected so tests can pin it; the default is Math.random.

export interface BackoffOptions {
  baseMs?: number // first delay, default 1000
  capMs?: number // hard ceiling on any delay, default 60_000
  maxTries?: number // attempts before giving up, default 10
  jitter?: number // fraction, default 0.2 (+-20%)
  random?: () => number // returns [0, 1), default Math.random
}

export interface Backoff {
  /** Delay in ms before the next try, or null once maxTries is spent. */
  next(): number | null
  /** Tries made since the last reset. */
  readonly tries: number
  /** Start over, e.g. after a successful reconnect. */
  reset(): void
}

export function createBackoff(opts: BackoffOptions = {}): Backoff {
  const base = opts.baseMs ?? 1000
  const cap = opts.capMs ?? 60_000
  const maxTries = opts.maxTries ?? 10
  const jitter = opts.jitter ?? 0.2
  const random = opts.random ?? Math.random
  let tries = 0

  return {
    next() {
      if (tries >= maxTries) return null
      const raw = Math.min(cap, base * 2 ** tries)
      tries++
      // Jitter spreads retries of many panels apart; the cap stays a hard ceiling.
      const spread = raw * (1 + jitter * (2 * random() - 1))
      return Math.min(cap, Math.max(0, Math.round(spread)))
    },
    get tries() {
      return tries
    },
    reset() {
      tries = 0
    },
  }
}
