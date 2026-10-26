// Persona versions: each save keeps the instructions it replaced, so a change that made a persona worse
// can be compared and undone.

export type Version = { at: number; instructions: string; model: string; note?: string }

/** Keeps the old instructions when they changed; newest first, at most `keep`. */
export function pushVersion(history: Version[] = [], old: { instructions: string; model: string }, next: { instructions: string; model: string }, note?: string, keep = 15, at = Date.now()): Version[] {
  if (old.instructions === next.instructions && old.model === next.model) return history
  if (history[0] && history[0].instructions === old.instructions && history[0].model === old.model) return history
  return [{ at, instructions: old.instructions, model: old.model, ...(note ? { note } : {}) }, ...history].slice(0, keep)
}
