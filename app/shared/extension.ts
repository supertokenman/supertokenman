// Phase 89: a scope for the app's own extensions; everything an extension starts is owned by its scope and
// released by dispose, so turning one off leaves nothing behind. Only code shipped with the app uses this.

export type Disposable = () => void
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...a: any[]) => void
type Emitter = { on(ev: string, fn: Listener): unknown; removeListener(ev: string, fn: Listener): unknown }

/** What an extension may start; each call hands back the resource and records how to release it. */
export interface Scope {
  readonly id: string
  /** An event listener: `on(emitter, 'event', fn)` with removeListener on dispose. */
  on(emitter: Emitter, ev: string, fn: Listener): void
  /** A repeating timer, cleared on dispose. */
  every(ms: number, fn: () => void): void
  /** A one-off timer, cleared on dispose if it has not fired. */
  after(ms: number, fn: () => void): void
  /** Anything else with its own release: an IPC handler, a child process, a watcher. */
  own(release: Disposable, label?: string): void
  /** Resources still held, by kind. */
  readonly held: { listeners: number; timers: number; owned: number }
  readonly disposed: boolean
}

export interface Extension {
  id: string
  activate(scope: Scope): void | Promise<void>
  /** Optional last words; resources are released by the scope whether or not this exists. */
  deactivate?(): void | Promise<void>
}

type Clock = { setInterval: typeof setInterval; clearInterval: typeof clearInterval; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }

export function createScope(id: string, clock: Clock = globalThis): Scope & { dispose(): string[] } {
  const listeners = new Set<Disposable>()
  const timers = new Set<Disposable>()
  const owned = new Map<Disposable, string>()
  let disposed = false
  const live = () => {
    if (disposed) throw new Error(`Extension ${id} is turned off; it cannot start anything.`)
  }
  return {
    id,
    on(emitter, ev, fn) {
      live()
      emitter.on(ev, fn)
      listeners.add(() => void emitter.removeListener(ev, fn))
    },
    every(ms, fn) {
      live()
      const t = clock.setInterval(fn, ms)
      timers.add(() => clock.clearInterval(t))
    },
    after(ms, fn) {
      live()
      const done: Disposable = () => clock.clearTimeout(t)
      const t = clock.setTimeout(() => (timers.delete(done), fn()), ms)
      timers.add(done)
    },
    own(release, label = 'resource') {
      live()
      owned.set(release, label)
    },
    get held() {
      return { listeners: listeners.size, timers: timers.size, owned: owned.size }
    },
    get disposed() {
      return disposed
    },
    /** Releases everything, newest first; returns the labels of releases that threw, after trying them all. */
    dispose() {
      if (disposed) return []
      disposed = true
      const failed: string[] = []
      const all: [Disposable, string][] = [...[...owned].reverse(), ...[...timers].map((d) => [d, 'timer'] as [Disposable, string]), ...[...listeners].map((d) => [d, 'listener'] as [Disposable, string])]
      for (const [d, label] of all) {
        try { d() } catch { failed.push(label) }
      }
      owned.clear(); timers.clear(); listeners.clear()
      return failed
    },
  }
}

/** Turns extensions on and off; an extension that fails to start is turned off again at once. */
export class Extensions {
  private on = new Map<string, { ext: Extension; scope: ReturnType<typeof createScope> }>()
  constructor(private clock?: Clock) {}
  async activate(ext: Extension): Promise<void> {
    if (this.on.has(ext.id)) return
    const scope = createScope(ext.id, this.clock)
    this.on.set(ext.id, { ext, scope })
    try {
      await ext.activate(scope)
    } catch (e) {
      await this.dispose(ext.id)
      throw e
    }
  }
  async dispose(id: string): Promise<string[]> {
    const x = this.on.get(id)
    if (!x) return []
    this.on.delete(id)
    try { await x.ext.deactivate?.() } catch { /* the scope still releases */ }
    return x.scope.dispose()
  }
  list() {
    return [...this.on.values()].map(({ ext, scope }) => ({ id: ext.id, held: scope.held }))
  }
}
