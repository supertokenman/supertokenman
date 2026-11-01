// The window's half of the Pilot (spec-pilot.md): main sends `pilot:run` with a palette id and the args it
// already validated; this runs the same closures the palette runs and returns the result with the inverse
// that undoes it. Pure: App.tsx hands in what it can do, so the logic is testable without React.
import { findCommand } from '../../shared/pilotcatalog'
import type { Inverse } from '../../shared/pilotundo'

export type PaletteEntry = { id: string; label: string; run: () => void | Promise<void> }
export type RunRequest = { id: string; args: Record<string, unknown>; undo?: Inverse }
export type RunResult = { ok: boolean; text: string; undo?: Inverse | null; after?: string }

/** What the window can do. Each member is a closure App.tsx already has for the palette or a shortcut. */
export type Env = {
  entries: () => PaletteEntry[]
  layout: () => string
  setLayout: (id: string) => void
  hasPanel: (sid: string) => boolean
  focusPanel: (sid: string) => void
  closePanel: (sid: string) => void
  /** both return the new panel's id, so the agent's undo can close it */
  openFolder: (cwd: string) => string | void | Promise<string | void>
  openPersona: (id: string) => string | void | Promise<string | void>
}

const RUN_MS = 8000

function limited<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((ok, fail) => {
    const t = setTimeout(() => fail(new Error('The window took too long to answer.')), RUN_MS)
    p.then(
      (v) => (clearTimeout(t), ok(v)),
      (e) => (clearTimeout(t), fail(e)),
    )
  })
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Runs one command. Never throws: a failure is a result with `ok: false` and a sentence the agent can pass on. */
export async function runCommand(env: Env, req: RunRequest): Promise<RunResult> {
  try {
    if (req.id === 'undo') return await applyInverse(env, req.undo)
    const found = findCommand(req.id)
    if (!found) return { ok: false, text: `The window has no command "${req.id}".` }
    const arg = { ...found.args, ...req.args }
    const spec = found.spec.id
    if (spec === 'layout-<id>') {
      const next = str(arg.id)
      const prev = env.layout()
      if (!next) return { ok: false, text: 'No layout given.' }
      env.setLayout(next)
      return { ok: true, text: `Layout is now ${next}.`, ...(prev !== next ? { undo: { kind: 'layout' as const, prev }, after: next } : {}) }
    }
    if (spec === 'panel-<sid>') {
      const sid = str(arg.sid)
      if (!env.hasPanel(sid)) return { ok: false, text: `There is no panel ${sid}.` }
      env.focusPanel(sid)
      return { ok: true, text: `Focused panel ${sid}.` }
    }
    if (spec === 'open-<cwd>') {
      const sid = await limited(Promise.resolve(env.openFolder(str(arg.cwd))))
      return { ok: true, text: `Opened a panel in ${str(arg.cwd)}.`, ...(sid ? { undo: { kind: 'panels' as const, opened: [sid] } } : {}) }
    }
    if (spec === 'persona-<id>') {
      const sid = await limited(Promise.resolve(env.openPersona(str(arg.id))))
      return { ok: true, text: `Started a panel with persona ${str(arg.id)}.`, ...(sid ? { undo: { kind: 'panels' as const, opened: [sid] } } : {}) }
    }
    const entry = env.entries().find((e) => e.id === req.id)
    if (!entry) return { ok: false, text: `"${req.id}" is not available in this window right now.` }
    await limited(Promise.resolve(entry.run()))
    return { ok: true, text: `Opened ${entry.label}.` }
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) }
  }
}

/** The inverse main recorded, applied. Layout and the panels the agent opened can be undone here. */
export async function applyInverse(env: Env, inv: Inverse | undefined): Promise<RunResult> {
  if (!inv) return { ok: false, text: 'Nothing to undo.' }
  if (inv.kind === 'layout') {
    env.setLayout(inv.prev)
    return { ok: true, text: `Layout is back to ${inv.prev}.` }
  }
  if (inv.kind === 'panels') {
    if (inv.closed?.length) return { ok: false, text: 'A closed panel cannot be opened again from here.' }
    for (const sid of inv.opened ?? []) env.closePanel(sid)
    return { ok: true, text: 'Closed the panels that were opened.' }
  }
  return { ok: false, text: 'This change is undone in Settings.' }
}
