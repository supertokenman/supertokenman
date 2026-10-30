// Pack state file (pure): the shape of <userData>/packs/state.json, read validation with a read-only fallback
// for unknown schema versions, and immutable updates for the installer. No I/O: main reads and writes the text
// (atomic temp file + rename) and calls these functions.
import { z } from 'zod'

const sha = z.string().regex(/^[0-9a-f]{64}$/)
const semver = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)

const source = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('git'), url: z.string().regex(/^https:\/\/\S+$/).max(2048), commit: z.string().regex(/^[0-9a-f]{7,40}$/) }),
  z.strictObject({ kind: z.literal('folder'), path: z.string().min(1).max(4096) }),
])

export const InstallSchema = z.strictObject({
  packId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/),
  scope: z.enum(['project', 'global']),
  root: z.string().min(1).max(4096),
  version: semver,
  previous: semver.nullable(),
  source,
  installedAt: z.number().int().nonnegative(),
  files: z.array(z.strictObject({ to: z.string().min(1).max(512), sha256: sha })).max(200),
  rulesSha256: sha.nullable(),
  mcpEnabled: z.record(z.string(), z.boolean()),
  hostsApproved: z.array(z.string().max(253)).max(50),
})

export const StateSchema = z.strictObject({ schema: z.literal(1), installs: z.array(InstallSchema) })

export type PackInstall = z.infer<typeof InstallSchema>
export type PackState = z.infer<typeof StateSchema>
export type InstallKey = Pick<PackInstall, 'packId' | 'scope' | 'root'>
export type ReadResult =
  | { mode: 'rw'; state: PackState; warnings: string[] }
  | { mode: 'readonly'; state: null; warnings: string[]; schema: unknown }
  | { mode: 'invalid'; errors: string[] }

export const emptyState = (): PackState => ({ schema: 1, installs: [] })

/**
 * Reads state.json text. null means no file yet (empty state). A parseable file with a schema number this
 * build does not know is read-only: nothing may be written over it. Anything else that fails validation is invalid.
 */
export function readState(text: string | null): ReadResult {
  if (text === null) return { mode: 'rw', state: emptyState(), warnings: [] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { mode: 'invalid', errors: ['state.json is not valid JSON'] }
  }
  const schema = (raw as { schema?: unknown } | null)?.schema
  if (schema !== 1)
    return {
      mode: 'readonly',
      state: null,
      schema,
      warnings: [`state.json has schema ${JSON.stringify(schema)}; this build reads schema 1. Packs are read-only until the app is updated.`],
    }
  const r = StateSchema.safeParse(raw)
  if (!r.success) return { mode: 'invalid', errors: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) }
  return { mode: 'rw', state: r.data, warnings: [] }
}

/** Serializes a state for writing; throws if it does not match the schema. */
export function writeState(state: PackState): string {
  return JSON.stringify(StateSchema.parse(state), null, 2) + '\n'
}

const same = (a: InstallKey, b: InstallKey) => a.packId === b.packId && a.scope === b.scope && a.root === b.root

export function findInstall(state: PackState, key: InstallKey): PackInstall | undefined {
  return state.installs.find((i) => same(i, key))
}

/** Adds the install, or replaces the one with the same packId, scope and root. Returns a new state. */
export function upsertInstall(state: PackState, install: PackInstall): PackState {
  const next = InstallSchema.parse(install)
  const rest = state.installs.filter((i) => !same(i, next))
  return { ...state, installs: [...rest, next] }
}

export function removeInstall(state: PackState, key: InstallKey): PackState {
  return { ...state, installs: state.installs.filter((i) => !same(i, key)) }
}

/** Moves an install to a new version. The version it replaces becomes `previous` (one is kept). */
export function recordUpdate(
  state: PackState,
  key: InstallKey,
  to: Pick<PackInstall, 'version' | 'files' | 'rulesSha256' | 'source' | 'installedAt' | 'mcpEnabled' | 'hostsApproved'>,
): PackState {
  const cur = findInstall(state, key)
  if (!cur) throw new Error(`no install of ${key.packId} in ${key.root}`)
  const previous = to.version === cur.version ? cur.previous : cur.version
  return upsertInstall(state, { ...cur, ...to, previous })
}

/** Rolls back to the previous version. Afterwards there is no previous version recorded. */
export function recordRollback(
  state: PackState,
  key: InstallKey,
  to: Pick<PackInstall, 'version' | 'files' | 'rulesSha256' | 'source' | 'installedAt' | 'mcpEnabled' | 'hostsApproved'>,
): PackState {
  const cur = findInstall(state, key)
  if (!cur) throw new Error(`no install of ${key.packId} in ${key.root}`)
  if (!cur.previous || cur.previous !== to.version) throw new Error(`${to.version} is not the previous version of ${key.packId}`)
  return upsertInstall(state, { ...cur, ...to, previous: null })
}
