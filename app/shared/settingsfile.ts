// The app's settings file with a schema (phase 80): a version and migrations, types checked for the
// fields the app relies on (others pass through), atomic writes, a backup when the file is broken, and
// no credentials: a field named like a key or token is refused on save and dropped on load.
import { z } from 'zod'

export const VERSION = 2

const arr = z.array(z.unknown())
const rec = z.record(z.string(), z.unknown())
/** The shape checked on load and save; fields not listed pass through untouched. */
export const SCHEMA = z.looseObject({
  version: z.number().int().optional(),
  integrations: z.array(z.string()).default([]),
  personas: arr.optional(),
  triggers: arr.optional(),
  providers: arr.optional(),
  dbConns: arr.optional(),
  worktrees: arr.optional(),
  budget: rec.optional(),
  budgetSpend: rec.optional(),
  hotkey: z.string().optional(),
  smallModel: z.string().optional(),
  headroom: z.boolean().optional(),
  mcpSend: z.boolean().optional(),
  phone: z.object({ send: z.boolean().optional(), port: z.number().int().min(1024).max(65535).optional() }).optional(),
  voiceId: z.string().regex(/^[a-z]{2}_[a-z]+$/).optional(),
  isoImage: z.string().optional(),
})
export type SettingsShape = z.infer<typeof SCHEMA>

const SECRET_KEY = /(?:^|_|-|[a-z])(?:api_?key|apikey|token|secret|password|passwd|private_?key)$/i

/** Paths of fields whose names say they hold a credential and that hold a non-empty string. */
export function credentialFields(o: unknown, path = ''): string[] {
  if (Array.isArray(o)) return o.flatMap((v, i) => credentialFields(v, `${path}[${i}]`))
  if (!o || typeof o !== 'object') return []
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => {
    const p = path ? `${path}.${k}` : k
    if (SECRET_KEY.test(k) && typeof v === 'string' && v.length > 0) return [p]
    return credentialFields(v, p)
  })
}

const dropPath = (o: Record<string, unknown>, path: string) => {
  const parts = path.split(/\.|\[(\d+)\]/).filter(Boolean)
  let cur: Record<string, unknown> | unknown[] = o
  for (const k of parts.slice(0, -1)) cur = (cur as Record<string, unknown>)[k] as Record<string, unknown>
  delete (cur as Record<string, unknown>)[parts[parts.length - 1]!]
}

/** Migrations from each version to the next. Version 1 is any file written before the schema. */
export const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  1: (s) => {
    const out: Record<string, unknown> = { ...s, integrations: Array.isArray(s.integrations) ? s.integrations.filter((x) => typeof x === 'string') : [] }
    // fields that only lived a short while
    delete out.echartsTheme
    return out
  },
}

export type Loaded = { settings: SettingsShape & Record<string, unknown>; migrated: boolean; dropped: string[]; broken?: string; backup?: string }

/** Settings from the file's text: parsed, migrated to VERSION, checked, credentials removed. */
export function load(text: string | null, defaults: Record<string, unknown>): Loaded {
  if (text === null) return { settings: SCHEMA.parse({ ...defaults, version: VERSION }), migrated: false, dropped: [] }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object')
  } catch (e) {
    return { settings: SCHEMA.parse({ ...defaults, version: VERSION }), migrated: false, dropped: [], broken: e instanceof Error ? e.message : String(e) }
  }
  // the copy kept before a migration, with any credential already taken out
  const original = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
  for (const p of credentialFields(original)) dropPath(original, p)
  const backup = JSON.stringify(original, null, 2)
  let v = typeof raw.version === 'number' ? raw.version : 1
  let s = raw
  const from = v
  while (v < VERSION) {
    s = MIGRATIONS[v]?.(s) ?? s
    v++
  }
  s = { ...s, version: VERSION }
  const dropped = credentialFields(s)
  for (const p of dropped) dropPath(s, p)
  const r = SCHEMA.safeParse(s)
  if (!r.success) return { settings: SCHEMA.parse({ ...defaults, version: VERSION }), migrated: false, dropped, broken: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  return { settings: r.data, migrated: from !== VERSION, dropped, backup }
}

/** The text to write, or an error naming what is wrong (a credential, a wrong type). */
export function dump(s: Record<string, unknown>): string {
  const bad = credentialFields(s)
  if (bad.length) throw new Error(`Settings must not hold credentials (${bad.join(', ')}); keep them in the vault.`)
  const r = SCHEMA.safeParse({ ...s, version: VERSION })
  if (!r.success) throw new Error(`Settings not saved: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  return JSON.stringify(r.data, null, 2)
}
