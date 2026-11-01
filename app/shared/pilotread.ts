// Read projections for the Pilot's read tools. Pure. Settings go through an allowlist: a key that is not
// listed is never returned, and a key that is vault-backed is dropped even when listed.

/** Settings the agent may read. Allowlist, not denylist: a new setting is hidden until someone lists it. */
export const PUBLIC_SETTING_KEYS: readonly string[] = ['hotkey', 'smallModel', 'headroom', 'voiceId']

export type PublicSettings = { values: Record<string, unknown>; withheld: string[] }

/**
 * The readable settings. `keys` narrows the result (default: every allowlisted key present). `vaultBacked`
 * names keys whose values live in the vault; they are withheld even when allowlisted. `withheld` lists
 * requested keys that were not returned, by name only, never their values.
 */
export function publicSettings(all: Record<string, unknown>, opts: { keys?: readonly string[]; vaultBacked?: readonly string[] } = {}): PublicSettings {
  const vault = new Set(opts.vaultBacked ?? [])
  const asked = opts.keys ?? PUBLIC_SETTING_KEYS.filter((k) => k in all)
  const values: Record<string, unknown> = {}
  const withheld: string[] = []
  for (const k of asked) {
    if (!PUBLIC_SETTING_KEYS.includes(k) || vault.has(k) || !(k in all)) {
      withheld.push(k)
      continue
    }
    values[k] = all[k]
  }
  return { values, withheld }
}
