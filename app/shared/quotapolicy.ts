// Phase 88: which source a panel may bill, failing closed when the plan's limit is reached

/** setup: whatever the environment already gives; plan: the Claude plan only; api: the paid API key; custom: an endpoint the person runs. */
export type Source = 'setup' | 'plan' | 'api' | 'custom'
export const SOURCES: Source[] = ['setup', 'plan', 'api', 'custom']

const PAID = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'AWS_BEARER_TOKEN_BEDROCK']

export type EnvOpts = { apiKey?: string; customUrl?: string; customOn?: boolean; localProxy?: string }

/** The environment a panel runs with for a source; an error when the source cannot be honoured. */
export function envFor(src: Source, env: Record<string, string | undefined>, o: EnvOpts = {}): { env: Record<string, string | undefined>; error?: string } {
  if (src === 'setup') return { env }
  const out = { ...env }
  for (const k of PAID) delete out[k]
  // only a local compressing proxy may sit in front of the plan or the key
  if (out.ANTHROPIC_BASE_URL && out.ANTHROPIC_BASE_URL !== o.localProxy) delete out.ANTHROPIC_BASE_URL
  if (src === 'plan') return { env: out }
  if (src === 'api') return o.apiKey ? { env: { ...out, ANTHROPIC_API_KEY: o.apiKey } } : { env, error: 'Add ANTHROPIC_API_KEY to the vault to use the paid API.' }
  if (!o.customOn) return { env, error: 'Custom endpoints are off. Turn them on in Settings first.' }
  if (!validCustom(o.customUrl)) return { env, error: 'The custom endpoint must be an http(s) address.' }
  return { env: { ...out, ANTHROPIC_BASE_URL: o.customUrl } }
}

export function validCustom(url?: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(String(url)).protocol) } catch { return false }
}

/** A plan limit or rate limit, as the CLI or the API words it; overload is not a quota. */
export function isQuotaError(message: string): boolean {
  const m = String(message ?? '')
  if (/overload/i.test(m)) return false
  return /\b429\b|rate[ _-]?limit|usage limit|limit (?:reached|exceeded)|reached your .*limit|quota/i.test(m)
}

/** What happens on a quota error: the plan pauses and never switches; other sources just report. */
export const onQuota = (src: Source): 'pause' | 'report' => (src === 'plan' ? 'pause' : 'report')

/** Confirmations a switch needs: one for any change, two for sending plan traffic through a custom endpoint. */
export const confirmsFor = (from: Source, to: Source): number => (from === to ? 0 : to === 'custom' && (from === 'plan' || from === 'setup') ? 2 : 1)

export type Window = { kind: string; percentUsed: number; resetsAt?: string }
/** The tightest limit window the API reported; an estimate, since the plan's limits are not published exactly. */
export function headroom(windows: Window[]): { kind: string; percent: number; resetsAt?: string; level: 'ok' | 'warn' | 'full' } | null {
  const w = [...windows].filter((x) => Number.isFinite(x.percentUsed)).sort((a, b) => b.percentUsed - a.percentUsed)[0]
  if (!w) return null
  const percent = Math.max(0, Math.min(100, Math.round(w.percentUsed)))
  return { kind: w.kind, percent, resetsAt: w.resetsAt, level: percent >= 100 ? 'full' : percent >= 80 ? 'warn' : 'ok' }
}
