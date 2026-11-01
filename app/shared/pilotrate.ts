// Rate limit for Pilot actions, one token bucket per panel: 30 actions a minute, burst 10. An ask or
// confirm action costs two tokens. Pure: the clock is injected. Not agent-editable.
import type { Tier } from './pilotcatalog.js'

export const PILOT_RATE = { perMinute: 30, burst: 10 } as const

export type Take = { ok: true; left: number } | { ok: false; error: string; retryAfterMs: number }

export function createPilotRate(now: () => number, cfg: { perMinute: number; burst: number } = PILOT_RATE) {
  const buckets = new Map<string, { tokens: number; at: number }>()
  const refillPerMs = cfg.perMinute / 60_000

  return {
    /** Takes the cost of one action for a panel, or refuses with the wait until it would fit. */
    take(panel: string, tier: Tier): Take {
      const t = now()
      const cost = tier === 'free' ? 1 : 2
      const b = buckets.get(panel) ?? { tokens: cfg.burst, at: t }
      b.tokens = Math.min(cfg.burst, b.tokens + (t - b.at) * refillPerMs)
      b.at = t
      if (b.tokens < cost) {
        buckets.set(panel, b)
        const retryAfterMs = Math.ceil((cost - b.tokens) / refillPerMs)
        return { ok: false, error: `Pilot rate limit: wait ${Math.ceil(retryAfterMs / 1000)} s before the next action`, retryAfterMs }
      }
      b.tokens -= cost
      buckets.set(panel, b)
      return { ok: true, left: Math.floor(b.tokens) }
    },
    /** Forgets a panel (closed). */
    drop(panel: string): void {
      buckets.delete(panel)
    },
  }
}
