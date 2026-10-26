// Headroom (Apache-2.0): a local proxy that compresses what the panels send to Anthropic (tool
// output, logs, JSON, files) before it is billed. When the person turns it on, the app starts the
// proxy on this Mac only, new panels talk to Anthropic through it, and its own stats say how many
// tokens it removed and what that was worth. If it is not healthy, panels go straight to Anthropic.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const HEADROOM_PORT = Number(process.env.STM_HEADROOM_PORT ?? 8797)
export const HEADROOM_URL = `http://127.0.0.1:${HEADROOM_PORT}`

let dir = ''
export const setHeadroomDir = (d: string) => (dir = d)
export const headroomDir = () => dir

/** The headroom program: the app's own install first, then the usual places a person installs it. */
export function headroomBin(): string | null {
  const places = [join(dir, '.venv', 'bin', 'headroom'), join(homedir(), '.local', 'bin', 'headroom'), '/opt/homebrew/bin/headroom', '/usr/local/bin/headroom']
  return places.find((p) => p && existsSync(p)) ?? null
}

export type HeadroomStats = {
  requests: number
  tokensBefore: number
  tokensRemoved: number
  tokensSaved: number
  savedUsd: number
  savingsPct: number
  layers: { name: string; tokens: number }[]
  /** shorter answers: how much output the shaper removed, and how that is known (a holdout measures it) */
  output: { active: boolean; method: 'measured' | 'estimated' | 'modelled' | null; percent: number; low: number | null; high: number | null; tokens: number; requests: number } | null
  /** the prompt cache: requests that read it, and misses caused by the start of the prompt changing */
  cache: { requests: number; hits: number; prefixMisses: number } | null
}

/** Its own numbers, read from /stats; null when it is not answering. */
export async function headroomStats(doFetch: typeof fetch = fetch): Promise<HeadroomStats | null> {
  try {
    const r = await doFetch(`${HEADROOM_URL}/stats`, { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return null
    const j = (await r.json()) as {
      summary?: { api_requests?: number; compression?: { total_tokens_before?: number; total_tokens_removed?: number; total_tokens_saved_all_layers?: number }; cost?: { total_saved_usd?: number; savings_pct?: number } }
      savings?: { by_layer?: Record<string, { tokens?: number }> }
      tokens?: { output_reduction?: { active?: boolean; method?: string | null; reduction_percent?: number; ci_low_percent?: number | null; ci_high_percent?: number | null; tokens_saved?: number; requests?: number } }
      prefix_cache?: { totals?: { requests?: number; hit_requests?: number }; miss_attribution?: { totals?: { prefix_change?: number } } }
    }
    const c = j.summary?.compression ?? {}
    return {
      requests: j.summary?.api_requests ?? 0,
      tokensBefore: c.total_tokens_before ?? 0,
      tokensRemoved: c.total_tokens_removed ?? 0,
      tokensSaved: c.total_tokens_saved_all_layers ?? c.total_tokens_removed ?? 0,
      savedUsd: j.summary?.cost?.total_saved_usd ?? 0,
      savingsPct: j.summary?.cost?.savings_pct ?? 0,
      layers: Object.entries(j.savings?.by_layer ?? {}).map(([name, v]) => ({ name, tokens: v.tokens ?? 0 })).filter((l) => l.tokens > 0),
      output: outputOf(j.tokens?.output_reduction),
      cache: j.prefix_cache?.totals ? { requests: j.prefix_cache.totals.requests ?? 0, hits: j.prefix_cache.totals.hit_requests ?? 0, prefixMisses: j.prefix_cache.miss_attribution?.totals?.prefix_change ?? 0 } : null,
    }
  } catch {
    return null
  }
}

function outputOf(o: { active?: boolean; method?: string | null; reduction_percent?: number; ci_low_percent?: number | null; ci_high_percent?: number | null; tokens_saved?: number; requests?: number } | undefined): HeadroomStats['output'] {
  if (!o) return null
  const method = o.method === 'measured' || o.method === 'estimated' || o.method === 'modelled' ? o.method : null
  return { active: Boolean(o.active), method, percent: o.reduction_percent ?? 0, low: o.ci_low_percent ?? null, high: o.ci_high_percent ?? null, tokens: o.tokens_saved ?? 0, requests: o.requests ?? 0 }
}

export const headroomHealthy = async (doFetch: typeof fetch = fetch) => {
  try {
    const r = await doFetch(`${HEADROOM_URL}/health`, { signal: AbortSignal.timeout(1500) })
    return r.ok && Boolean(((await r.json()) as { ready?: boolean }).ready)
  } catch {
    return false
  }
}

let child: ChildProcess | null = null

/**
 * The proxy's arguments and environment. Shorter answers turn on Headroom's output shaper, which only
 * acts in its token mode (cache mode freezes the prompt and steers nothing), and hold 10% of
 * conversations out of it, so the reduction it reports is measured against them, not guessed.
 */
export function proxyArgs(shorter: boolean, logMessages = false) {
  // message logging keeps recent requests in the proxy's memory, so Savings can show what compression kept
  const args = ['proxy', '--host', '127.0.0.1', '--port', String(HEADROOM_PORT), ...(shorter ? ['--mode', 'token'] : []), ...(logMessages ? ['--log-messages'] : [])]
  const env: Record<string, string> = { HEADROOM_BEACON: 'off', HEADROOM_TELEMETRY: 'off', ...(shorter ? { HEADROOM_OUTPUT_SHAPER: '1', HEADROOM_OUTPUT_HOLDOUT: '0.1' } : {}) }
  return { args, env }
}

/** Starts the proxy on 127.0.0.1 if it is not answering yet; the anonymous beacon stays off. */
export async function startHeadroom(shorter = false, logMessages = false): Promise<boolean> {
  if (await headroomHealthy()) return true
  const bin = headroomBin()
  if (!bin) return false
  const { args, env } = proxyArgs(shorter, logMessages)
  child = spawn(bin, args, { env: { ...process.env, ...env }, stdio: 'ignore', detached: false })
  child.on('exit', () => (child = null))
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await headroomHealthy()) return true
  }
  return false
}

export function stopHeadroom() {
  child?.kill()
  child = null
}

/** The environment a new panel gets: through Headroom when it is on and healthy, straight otherwise. */
export async function panelEnv(on: boolean): Promise<Record<string, string>> {
  return on && (await headroomHealthy()) ? { ANTHROPIC_BASE_URL: HEADROOM_URL } : {}
}
