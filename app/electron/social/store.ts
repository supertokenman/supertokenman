// Where the social side keeps things: credentials in the vault (one encrypted entry per network,
// never marked for commands), the queue and the cached numbers in a plain file without secrets.
import type { AccountId, Cred } from './core.js'
import { planMigration } from '../../shared/socaccounts.js'

export type VaultLike = {
  get: (n: string) => string | undefined
  set: (n: string, v: string, forCommands?: boolean) => void
  delete: (n: string) => void
  /** secret names, when the vault can list them; without it only the old key and _DEFAULT are probed */
  list?: () => { name: string }[]
}

/** SOCIAL_<NET> (the old key) or, with a handle, SOCIAL_<NET>_<HANDLE>. */
export const credName = (n: AccountId, handle?: string) =>
  handle ? `SOCIAL_${n.toUpperCase()}_${handle.toUpperCase().replace(/[^A-Z0-9]/g, '_')}` : `SOCIAL_${n.toUpperCase()}`

/** The key a network's credential sits under now: the old key while it exists, else the first migrated one. */
function keyFor(v: VaultLike, n: AccountId): string {
  const old = credName(n)
  if (v.get(old)) return old
  const pre = `${old}_`
  const names = v.list ? v.list().map((x) => x.name).filter((k) => k.startsWith(pre)) : [credName(n, 'default')]
  return names.find((k) => k === `${pre}DEFAULT` && v.get(k)) ?? names.find((k) => v.get(k)) ?? old
}

export function readCred(v: VaultLike, n: AccountId, handle?: string): Cred | null {
  const raw = v.get(handle ? credName(n, handle) : keyFor(v, n))
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as Cred
    return c.accessToken || c.keys ? c : null
  } catch {
    // a bare token pasted by hand
    return { accessToken: raw.trim() }
  }
}

/** Writes where the credential already lives, so a refresh never leaves a second copy behind. */
export function writeCred(v: VaultLike, n: AccountId, c: Cred, handle?: string) {
  v.set(handle ? credName(n, handle) : keyFor(v, n), JSON.stringify(c), false)
}

/** Removes the credential under whichever key it sits. */
export function deleteCred(v: VaultLike, n: AccountId, handle?: string) {
  v.delete(handle ? credName(n, handle) : keyFor(v, n))
}

export type MigrationReport = { copied: string[]; removed: string[]; kept: string[] }

/**
 * SOCIAL_<NET> -> SOCIAL_<NET>_<HANDLE> ('default' when the handle is unknown). Copy first, read the copy
 * back, and delete the old key only when it matches. Safe to run again: a finished key yields no steps and
 * a step that fails leaves the old key in place. Reads work throughout (see keyFor). Never logs a value.
 */
export function migrateVault(v: VaultLike, handles: Record<string, string | undefined> = {}): MigrationReport {
  const rep: MigrationReport = { copied: [], removed: [], kept: [] }
  if (!v.list) return rep
  const names = v.list().map((x) => x.name)
  const failed = new Set<string>()
  const dest = new Map<string, string>()
  const steps = planMigration(names, handles)
  for (const st of steps) if (st.op === 'copy') dest.set(st.from, st.to)
  for (const st of steps) {
    try {
      if (st.op === 'copy') {
        const val = v.get(st.from)
        if (!val) throw new Error('empty')
        v.set(st.to, val, false)
        if (v.get(st.to) !== val) {
          // never leave a bad copy
          v.delete(st.to)
          throw new Error('copy differs')
        }
        rep.copied.push(st.to)
      } else {
        if (failed.has(st.key)) continue
        const to = dest.get(st.key) ?? names.find((k) => k.startsWith(`${st.key}_`) && v.get(k) === v.get(st.key))
        if (!to || !v.get(to) || v.get(to) !== v.get(st.key)) throw new Error('no verified copy')
        v.delete(st.key)
        rep.removed.push(st.key)
      }
    } catch {
      const k = st.op === 'copy' ? st.from : st.key
      failed.add(k)
      if (!rep.kept.includes(k)) rep.kept.push(k)
    }
  }
  return rep
}

/** Every secret a social credential holds, to mask in any message. */
export const secretsOf = (c: Cred | null) => (c ? [c.accessToken, c.refreshToken, c.clientSecret, c.ids?.pageToken, ...Object.values(c.keys ?? {})].filter((s): s is string => Boolean(s)) : [])
