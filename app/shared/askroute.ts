// Which turn answers which ask: an ask that was queued in the composer is claimed by the message the person sends.
export type Waiting = { id: string; head: string }

/** How much of the delivered message identifies it when the person sends it from the composer. */
export const HEAD = 120

/** The waiting ask whose delivered message starts `prompt` (edits after the start are fine), and the rest. */
export function claim(waiting: Waiting[], prompt: string): { id: string; rest: Waiting[] } | null {
  const p = prompt.trimStart()
  const i = waiting.findIndex((w) => w.head && p.startsWith(w.head))
  return i < 0 ? null : { id: waiting[i]!.id, rest: waiting.filter((_, k) => k !== i) }
}
