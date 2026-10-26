import { describe, expect, it } from 'vitest'
import { headroomStats, proxyArgs } from './headroom'

// the shape of Headroom 0.41's /stats, trimmed to what the app reads
const payload = {
  summary: { api_requests: 12, compression: { total_tokens_before: 90000, total_tokens_removed: 30000, total_tokens_saved_all_layers: 31000 }, cost: { total_saved_usd: 0.42, savings_pct: 33 } },
  savings: { by_layer: { compression: { tokens: 30000 }, cache: { tokens: 0 } } },
  tokens: { output_reduction: { available: true, active: true, method: 'measured', band_is_ci: true, tokens_saved: 1800, baseline_tokens: 9000, reduction_percent: 20.0, ci_low_percent: 12.5, ci_high_percent: 27.5, requests: 40 } },
  prefix_cache: { totals: { requests: 12, hit_requests: 10 }, miss_attribution: { totals: { prefix_change: 1, prefix_change_pct: 8.3 } } },
}
const fakeFetch = (body: unknown) => (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch

describe('headroom', () => {
  it('reads compression, the measured output reduction and the cache misses from /stats', async () => {
    const s = await headroomStats(fakeFetch(payload))
    expect(s).toMatchObject({ requests: 12, tokensSaved: 31000, savedUsd: 0.42, layers: [{ name: 'compression', tokens: 30000 }] })
    expect(s?.output).toEqual({ active: true, method: 'measured', percent: 20, low: 12.5, high: 27.5, tokens: 1800, requests: 40 })
    expect(s?.cache).toEqual({ requests: 12, hits: 10, prefixMisses: 1 })
  })
  it('says nothing about output or cache when an older Headroom does not report them', async () => {
    const s = await headroomStats(fakeFetch({ summary: payload.summary }))
    expect(s?.output).toBeNull()
    expect(s?.cache).toBeNull()
  })
  it('keeps the beacon off, and turns on the shaper with its holdout and token mode only for shorter answers', () => {
    expect(proxyArgs(false)).toEqual({ args: ['proxy', '--host', '127.0.0.1', '--port', '8797'], env: { HEADROOM_BEACON: 'off', HEADROOM_TELEMETRY: 'off' } })
    const on = proxyArgs(true)
    expect(on.args).toContain('token')
    expect(on.env).toMatchObject({ HEADROOM_BEACON: 'off', HEADROOM_OUTPUT_SHAPER: '1', HEADROOM_OUTPUT_HOLDOUT: '0.1' })
  })
})
