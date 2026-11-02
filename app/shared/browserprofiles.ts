// Named browser profiles of the agent browser. A profile is a session partition (cookies, storage) the
// person creates and names; several panels may use the same one, which is how one sign-in serves them
// all. Without a named profile a panel has its own partition, or the project's. A project can also have a
// default profile, used by every panel of that folder that has not been given another choice. Pure: the
// main process keeps the lists in userData/agentbrowser.json and passes them in.

export type Profile = { id: string; name: string }
/** `panel`: this panel alone; `project`: the folder's shared one; `profile:<id>`: a named profile. */
export type Scope = 'panel' | 'project' | `profile:${string}`

export type Profiles = {
  list: Profile[]
  /** the scope chosen for a panel by the person */
  scopes: Record<string, string>
  /** the default profile id of a project folder */
  defaults: Record<string, string>
}

export const MAX_PROFILES = 12
export const NAME_MAX = 40

export const emptyProfiles = (): Profiles => ({ list: [], scopes: {}, defaults: {} })

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const n = raw.replace(/\s+/g, ' ').trim()
  return n.length >= 1 && n.length <= NAME_MAX ? n : null
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export type Edit<T> = { ok: true; value: T } | { ok: false; error: string }

export function createProfile(p: Profiles, rawName: unknown, id: string): Edit<{ profiles: Profiles; profile: Profile }> {
  const name = cleanName(rawName)
  if (!name) return { ok: false, error: `Name the profile (1 to ${NAME_MAX} characters).` }
  if (p.list.length >= MAX_PROFILES) return { ok: false, error: `At most ${MAX_PROFILES} profiles.` }
  if (p.list.some((x) => same(x.name, name))) return { ok: false, error: `A profile called "${name}" already exists.` }
  const profile = { id, name }
  return { ok: true, value: { profiles: { ...p, list: [...p.list, profile] }, profile } }
}

export function renameProfile(p: Profiles, id: string, rawName: unknown): Edit<Profiles> {
  const name = cleanName(rawName)
  if (!name) return { ok: false, error: `Name the profile (1 to ${NAME_MAX} characters).` }
  if (!p.list.some((x) => x.id === id)) return { ok: false, error: 'That profile is gone.' }
  if (p.list.some((x) => x.id !== id && same(x.name, name))) return { ok: false, error: `A profile called "${name}" already exists.` }
  return { ok: true, value: { ...p, list: p.list.map((x) => (x.id === id ? { ...x, name } : x)) } }
}

/** Removes a profile; panels and projects that used it fall back to their own. */
export function deleteProfile(p: Profiles, id: string): Edit<{ profiles: Profiles; panels: string[] }> {
  if (!p.list.some((x) => x.id === id)) return { ok: false, error: 'That profile is gone.' }
  const tag = `profile:${id}`
  const panels = Object.keys(p.scopes).filter((k) => p.scopes[k] === tag)
  const scopes = Object.fromEntries(Object.entries(p.scopes).filter(([, v]) => v !== tag))
  const defaults = Object.fromEntries(Object.entries(p.defaults).filter(([, v]) => v !== id))
  return { ok: true, value: { profiles: { list: p.list.filter((x) => x.id !== id), scopes, defaults }, panels } }
}

export function setScope(p: Profiles, panel: string, scope: string): Edit<Profiles> {
  if (scope === 'panel' || scope === 'project') return { ok: true, value: { ...p, scopes: { ...p.scopes, [panel]: scope } } }
  const m = /^profile:(.+)$/.exec(scope)
  if (!m || !p.list.some((x) => x.id === m[1])) return { ok: false, error: 'That profile is gone.' }
  return { ok: true, value: { ...p, scopes: { ...p.scopes, [panel]: scope } } }
}

/** The project's default profile (null clears it). */
export function setDefault(p: Profiles, root: string, id: string | null): Edit<Profiles> {
  const { [root]: _old, ...rest } = p.defaults
  void _old
  if (id === null) return { ok: true, value: { ...p, defaults: rest } }
  if (!p.list.some((x) => x.id === id)) return { ok: false, error: 'That profile is gone.' }
  return { ok: true, value: { ...p, defaults: { ...rest, [root]: id } } }
}

/** What a panel uses: its own choice, else the project's default profile, else its own partition. */
export function effectiveScope(p: Profiles, panel: string, root: string): Scope {
  const own = p.scopes[panel]
  if (own === 'panel' || own === 'project') return own
  const m = own ? /^profile:(.+)$/.exec(own) : null
  if (m && p.list.some((x) => x.id === m[1])) return own as Scope
  const def = p.defaults[root]
  if (def && p.list.some((x) => x.id === def)) return `profile:${def}`
  return 'panel'
}

/** The session partition of a named profile. Fixed prefix, id from a random uuid. */
export const profilePartition = (id: string): string => `persist:browse-n-${id.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`
