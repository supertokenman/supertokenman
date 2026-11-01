// The actions list for one window: what the Pilot did, newest first, and the inverse that undoes each.
// Pure: no fs, no electron. The inverse is data (not a closure), so it can be shown and re-checked.
// Undo does not ask: the owner decided that. The only refusals are "cannot be undone" and "changed since".

export type Inverse =
  | { kind: 'layout'; prev: string }
  | { kind: 'panels'; closed?: string[]; opened?: string[] }
  | { kind: 'setting'; key: string; prev: unknown }
  | { kind: 'routine'; id: string; prevEnabled: boolean }

export type Action = {
  id: string
  at: number
  panel: string
  /** palette id, e.g. `go-today` or `layout-grid` */
  command: string
  title: string
  /** the inverse; null when the action has none */
  undo: Inverse | null
  /** irreversible actions (money spent, sent, deleted, published) are listed as "cannot be undone" */
  irreversible?: boolean
  /** the value the action left behind, for the "changed since" check; undefined skips the check */
  after?: unknown
}

export type Plan =
  | { ok: true; inverse: Inverse }
  | { ok: false; reason: 'missing' | 'irreversible' | 'none' | 'changed' }

export const UNDO_CAP = 100

export class UndoStack {
  private items: Action[] = []

  constructor(private readonly cap = UNDO_CAP) {}

  /** Adds an action as the newest; the oldest drop once the cap is passed. */
  push(a: Action): void {
    this.items.push(a)
    if (this.items.length > this.cap) this.items.splice(0, this.items.length - this.cap)
  }

  /** Newest first. */
  list(): Action[] {
    return [...this.items].reverse()
  }

  get size(): number {
    return this.items.length
  }

  /**
   * Whether an action can be undone now, and its inverse. `current` is the value the action left behind,
   * read again by the caller; a different value means the person changed it since, so undo is refused.
   */
  plan(id: string, current?: unknown): Plan {
    const a = this.items.find((x) => x.id === id)
    if (!a) return { ok: false, reason: 'missing' }
    if (a.undo === null) return { ok: false, reason: a.irreversible ? 'irreversible' : 'none' }
    if (a.after !== undefined && current !== a.after) return { ok: false, reason: 'changed' }
    return { ok: true, inverse: a.undo }
  }

  /** Plans, and on success removes the action from the list (the undo has happened). */
  take(id: string, current?: unknown): Plan {
    const p = this.plan(id, current)
    if (p.ok) this.items = this.items.filter((x) => x.id !== id)
    return p
  }
}
