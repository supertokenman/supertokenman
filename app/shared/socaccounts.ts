import { cleanBrandKit, type BrandKit } from './brandkit.js'
// Account ids, vault keys, migration plan and project shape. Pure: no I/O.

export type Net = string

export interface Account {
  id: string
  net: Net
  handle: string
  name: string
}

export interface Project {
  id: string
  name: string
  accountIds: string[]
  brandKit: BrandKit
}

export type MigrationStep =
  | { op: 'copy'; from: string; to: string; accountId: string }
  | { op: 'delete'; key: string }

export type ProjectCheck = { ok: true; project: Project } | { ok: false; problem: string }

const OLD_KEY = /^SOCIAL_([A-Z0-9]+)$/
const TOKEN_KEY = /token|secret|passw|api[_-]?key|cookie|auth|bearer|credential/i
const TOKEN_VALUE = /^[A-Za-z0-9_\-+/=.]{32,}$/
const ACCOUNT_ID = /^[a-z0-9]+:\S+$/

export const accountId = (net: Net, handle: string): string => `${net.toLowerCase()}:${handle.toLowerCase()}`

const sanitise = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '_')

// Vault key SOCIAL_<NET>_<HANDLE>. `existing` holds keys already taken; a clash gets _2, _3, ...
export const vaultKey = (net: Net, handle: string, existing: Iterable<string> = []): string => {
  const taken = new Set(existing)
  const base = `SOCIAL_${sanitise(net)}_${sanitise(handle)}`
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    const k = `${base}_${i}`
    if (!taken.has(k)) return k
  }
}

// oldKeys: current vault keys. handles: net -> handle from the cred (missing means 'default').
// Copy only when the new key is absent; delete the old key after it. Already-migrated keys yield no steps.
export const planMigration = (oldKeys: string[], handles: Record<string, string | undefined>): MigrationStep[] => {
  const steps: MigrationStep[] = []
  const present = new Set(oldKeys)
  for (const old of oldKeys) {
    const m = OLD_KEY.exec(old)
    if (!m) continue
    const net = m[1].toLowerCase()
    const handle = handles[net] ?? handles[m[1]] ?? 'default'
    const to = `SOCIAL_${m[1]}_${sanitise(handle)}`
    if (!present.has(to)) steps.push({ op: 'copy', from: old, to, accountId: accountId(net, handle) })
    steps.push({ op: 'delete', key: old })
  }
  return steps
}

const looksLikeToken = (v: unknown, key = ''): string | null => {
  if (key && TOKEN_KEY.test(key)) return `field "${key}" looks like a credential`
  if (typeof v === 'string') return TOKEN_VALUE.test(v) ? 'value looks like a token' : null
  if (Array.isArray(v)) {
    for (const x of v) {
      const p = looksLikeToken(x)
      if (p) return p
    }
    return null
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const p = looksLikeToken(x, k)
      if (p) return p
    }
  }
  return null
}

// A project holds account ids only, and nothing that looks like a credential.
export const validateProject = (p: unknown): ProjectCheck => {
  if (!p || typeof p !== 'object') return { ok: false, problem: 'not an object' }
  const o = p as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id) return { ok: false, problem: 'id missing' }
  if (typeof o.name !== 'string' || !o.name) return { ok: false, problem: 'name missing' }
  if (!Array.isArray(o.accountIds) || !o.accountIds.every((a) => typeof a === 'string' && ACCOUNT_ID.test(a))) {
    return { ok: false, problem: 'accountIds must be account ids' }
  }
  const token = looksLikeToken(o.brandKit, 'brandKit') ?? looksLikeToken(o.accountIds, 'accountIds')
  if (token) return { ok: false, problem: token }
  for (const k of Object.keys(o)) {
    if (!['id', 'name', 'accountIds', 'brandKit'].includes(k)) return { ok: false, problem: `unknown field "${k}"` }
  }
  return { ok: true, project: { id: o.id, name: o.name, accountIds: [...(o.accountIds as string[])], brandKit: cleanBrandKit(o.brandKit) } }
}
