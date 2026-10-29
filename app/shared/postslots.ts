// Per-network slots for the queue: the next free slot of one network, and a re-placement of the queued
// items that took a slot. A hand-picked time is never moved. No I/O.

import { nextFreeSlot, type Slot } from './pubcal.js'

/** Each network's weekly slots. A day with no slot in a network's list is a day off for that network. */
export type NetSlots = Record<string, Slot[]>

/** A queued item as far as slots go; `hand` marks a time the person picked, which replanning keeps. */
export type SlotItem = { id: string; network: string; account?: string; when: number | null; hand?: boolean }

/** The slot key of an item: its account when it has one, else its network. */
const keyOf = (i: { network: string; account?: string }) => i.account ?? i.network

/**
 * The next free slot of `network`, taken only by the queued items of that same network. With `account`,
 * the account's own slots are used first (else the network's), and only that account's items take them.
 */
export function nextSlotFor(slots: NetSlots, network: string, queue: SlotItem[], now: Date, account?: string): number | null {
  const own = account != null && slots[account] != null
  const key = own ? account! : network
  const taken = queue.filter((i) => (own ? i.account === account : keyOf(i) === network)).map((i) => i.when)
  return nextFreeSlot(slots[key] ?? [], taken, now)
}

/**
 * Re-places the queued items that took a slot onto the network's current slots. Hand-picked items and
 * drafts stay where they are; so do items already due (`when` at or before `now`). Placed items keep their
 * order. An item with no slot left (no slots, or none within four weeks) keeps its time.
 * Returns a new array; the input is not changed.
 */
export function replan<T extends SlotItem>(slots: NetSlots, queue: T[], now: Date): T[] {
  const moved = new Map<string, number>()
  const movable = (i: T) => !i.hand && i.when != null && i.when > now.getTime()

  // an item with an account uses that account's slots when it has some, else its network's
  const keyFor = (i: T) => (i.account != null && slots[i.account] ? i.account : i.network)
  for (const net of new Set(queue.map(keyFor))) {
    // the times that stay put on this network block the slots; the movable ones are placed in turn
    const busy = queue.filter((i) => keyFor(i) === net && !movable(i) && i.when != null).map((i) => i.when)
    const own = queue.filter((i) => keyFor(i) === net && movable(i)).sort((a, b) => a.when! - b.when!)
    for (const item of own) {
      const at = nextFreeSlot(slots[net] ?? [], busy, now)
      if (at == null) continue
      moved.set(item.id, at)
      busy.push(at)
    }
  }
  return queue.map((i) => (moved.has(i.id) ? { ...i, when: moved.get(i.id)! } : i))
}
