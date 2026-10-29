// Where the social side keeps things: credentials in the vault (one encrypted entry per network,
// never marked for commands), the queue and the cached numbers in a plain file without secrets.
import type { AccountId, Cred } from './core.js'

export type VaultLike = { get: (n: string) => string | undefined; set: (n: string, v: string, forCommands?: boolean) => void; delete: (n: string) => void }

export const credName = (n: AccountId) => `SOCIAL_${n.toUpperCase()}`

export function readCred(v: VaultLike, n: AccountId): Cred | null {
  const raw = v.get(credName(n))
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as Cred
    return c.accessToken || c.keys ? c : null
  } catch {
    // a bare token pasted by hand
    return { accessToken: raw.trim() }
  }
}

export function writeCred(v: VaultLike, n: AccountId, c: Cred) {
  v.set(credName(n), JSON.stringify(c), false)
}

/** Every secret a social credential holds, to mask in any message. */
export const secretsOf = (c: Cred | null) => (c ? [c.accessToken, c.refreshToken, c.clientSecret, c.ids?.pageToken, ...Object.values(c.keys ?? {})].filter((s): s is string => Boolean(s)) : [])
