// Three-way update decision for pack files (spec section 7). Hashes are compared as strings:
// base = hash recorded in state (null: never ours), user = hash on disk now (null: missing),
// next = hash in the new pack version (null: absent there). Same table covers the rules block.

export type Hash = string | null

export type Action = 'keep' | 'update' | 'add' | 'remove' | 'conflict' | 'ask'

export type Decision = { action: Action; newBase: Hash }

/** One file's three hashes, keyed by its path in the pack. */
export type Entry = { path: string; base: Hash; user: Hash; next: Hash }

export type PlanItem = Decision & { path: string }

export type UpdatePlan = {
  items: PlanItem[]
  conflicts: string[]
  /** Files the user deleted: left alone, the user is asked. */
  asks: string[]
}

/** The decision for one file. `newBase` is what state should record afterwards. */
export function decide(base: Hash, user: Hash, next: Hash): Decision {
  if (base === null) {
    if (next === null) return { action: 'keep', newBase: null }
    if (user === null) return { action: 'add', newBase: next }
    return user === next ? { action: 'keep', newBase: next } : { action: 'conflict', newBase: base }
  }
  if (user === null) return { action: 'ask', newBase: base }
  if (next === null) {
    return user === base ? { action: 'remove', newBase: null } : { action: 'keep', newBase: base }
  }
  if (base === next) return { action: 'keep', newBase: base }
  if (user === base) return { action: 'update', newBase: next }
  if (user === next) return { action: 'keep', newBase: next }
  return { action: 'conflict', newBase: base }
}

/** Decides every file of an update; conflicts and asks are listed so nothing is overwritten silently. */
export function planUpdate(entries: Entry[]): UpdatePlan {
  const items: PlanItem[] = []
  const conflicts: string[] = []
  const asks: string[] = []
  for (const e of entries) {
    const d = decide(e.base, e.user, e.next)
    items.push({ path: e.path, ...d })
    if (d.action === 'conflict') conflicts.push(e.path)
    if (d.action === 'ask') asks.push(e.path)
  }
  return { items, conflicts, asks }
}
