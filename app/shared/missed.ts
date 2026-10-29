// Missed posts after the app was closed or the Mac slept. Pure: no clock, no I/O. An approved item
// that was due while the app was not running is late; a little late posts now, a lot late is held
// for the person to choose (Post now, Move, Skip) so a long gap does not cause a burst of stale posts.
import type { Item } from '../electron/social/queue.js'

/** How late an approved post may be and still post right away. */
export const GRACE_MS = 15 * 60_000

/** Approved items with networks still unpublished whose time has passed. Items with no time are not late. */
export function missed(items: Item[], now: number): Item[] {
  return items.filter((i) => i.approved && i.when != null && i.when <= now && i.networks.some((n) => !i.results[n]))
}

/** Splits the missed items: `postNow` when late by no more than the grace window, `held` when later. */
export function catchUp(items: Item[], now: number, graceMs: number = GRACE_MS): { postNow: Item[]; held: Item[] } {
  const postNow: Item[] = []
  const held: Item[] = []
  for (const i of missed(items, now)) (now - i.when! <= graceMs ? postNow : held).push(i)
  return { postNow, held }
}
