// Host decisions for the agent browser: which hosts a navigation may open. Pure: no electron, no fs.
// The policy gate (policygate.ts) decides on the host; this file normalises the host, refuses schemes and
// private addresses before the gate is asked, and writes the text of an "always" rule.
//
// Order: unparseable or non-http(s) address, then a private address (denied unless the panel is a Preview
// panel), then the policy rules with the host as the only field. A new host with no rule asks.

import { evaluate, type Ctx, type ScopedRule } from './policygate.js'
import { parseRule } from './policyrules.js'

export type HostNorm = { host: string; port?: number }

export type HostDecision =
  | { decision: 'allow'; reason: 'rule' | 'allowed'; host: string; rule?: string }
  | { decision: 'ask'; reason: 'new-host'; host: string; rule?: string }
  | { decision: 'deny'; reason: 'invalid' | 'scheme' | 'private' | 'rule'; host?: string; rule?: string }

export const BROWSER_OPEN_TOOL = 'mcp__stm__browser_open'
const GATE_TOOL_PATTERN = 'mcp__stm__browser_*'

/** Lowercase host without a trailing dot or a leading `www.`; the port is kept apart. IDN comes out as punycode. */
export function normalizeHost(input: string): HostNorm | null {
  const raw = input.trim()
  if (raw === '') return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  let host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (host === '') return null
  if (host.startsWith('www.') && host.slice(4).includes('.')) host = host.slice(4)
  const port = url.port === '' ? undefined : Number(url.port)
  return port === undefined ? { host } : { host, port }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** Loopback, private, link-local and .local names. Only these are denied for a navigation. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h === 'local' || h.endsWith('.local')) return true
  const v4 = IPV4.exec(h)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
  }
  if (h.startsWith('[')) {
    const v6 = h.slice(1, -1)
    return v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
  }
  return false
}

export type HostOptions = {
  rules: ScopedRule[]
  ctx: Ctx
  /** hosts the person already allowed for this profile */
  allowed?: string[]
  /** true for a Preview panel, where local addresses are the app's own dev server */
  previewPanel?: boolean
}

/** The decision for one navigation (or redirect target) to a URL. */
export function hostDecision(url: string, opts: HostOptions): HostDecision {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { decision: 'deny', reason: 'invalid' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { decision: 'deny', reason: 'scheme' }
  const norm = normalizeHost(parsed.host)
  if (!norm) return { decision: 'deny', reason: 'invalid' }
  if (isPrivateHost(norm.host) && !opts.previewPanel) return { decision: 'deny', reason: 'private', host: norm.host }
  // The gate sees the host alone, as the rule grammar expects; the path does not matter for host rules.
  const verdict = evaluate(opts.rules, { tool: BROWSER_OPEN_TOOL, input: { url: `https://${norm.host}/` } }, opts.ctx, 'ask')
  if (verdict.decision === 'deny') return { decision: 'deny', reason: 'rule', host: norm.host, rule: verdict.rule }
  if (verdict.decision === 'allow') return { decision: 'allow', reason: 'rule', host: norm.host, rule: verdict.rule }
  if (opts.allowed?.includes(norm.host)) return { decision: 'allow', reason: 'allowed', host: norm.host }
  return { decision: 'ask', reason: 'new-host', host: norm.host, rule: verdict.rule }
}

/** The rule text the "always" answer writes for one host. */
export function alwaysRule(host: string): string {
  const h = normalizeHost(host)
  if (!h || h.port !== undefined || h.host !== host.trim().toLowerCase() || !/^[a-z0-9.-]+$/.test(h.host)) {
    throw new Error(`not a plain host name: ${host}`)
  }
  return `allow ${GATE_TOOL_PATTERN} when host is "${h.host}" -- agent browser: always for this host`
}

/** Whether a rule text parses (used by the caller before it writes the file). */
export function isValidRule(text: string): boolean {
  return !('message' in parseRule(text))
}
