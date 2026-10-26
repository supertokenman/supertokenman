// One task, one owner: a request that is already being worked on in a panel is not started again in
// another. Two requests are the same task when most of their meaningful words are the same.
import { words } from './router.js'

export function sameTask(a: string, b: string, threshold = 0.6): boolean {
  const x = new Set(words(a).filter((w) => !w.startsWith('@')))
  const y = new Set(words(b).filter((w) => !w.startsWith('@')))
  if (x.size < 2 || y.size < 2) return false
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both) >= threshold
}

/** The busy panel already on this request, if any. */
export function ownerOf(text: string, panels: { sid: string; busy: boolean; asking: string }[]): string | null {
  return panels.find((p) => p.busy && p.asking && sameTask(text, p.asking))?.sid ?? null
}
