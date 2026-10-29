// Staggered multi-account scheduling: one shared slot set, each account posts at slot + k * gap, and
// per-account rate limits (posts per day, minimum gap between posts). No I/O.

import { slotAt, type Slot } from './pubcal.js'
import type { SlotItem } from './postslots.js'

export const DEFAULT_GAP_MIN = 20
export const DEFAULT_DAILY_CAP = 3
export const DEFAULT_MIN_GAP_MIN = 120

/** A per-account override; a missing field takes the default. */
export type AccountLimits = { dailyCap?: number; minGapMin?: number }

/** A queued post, with the account it goes out from. */
export type StaggerItem = SlotItem & { accountId: string }

export type Placement = { accountId: string; when: number }
export type Refusal = { accountId: string; when: number; reason: string }
export type StaggerPlan = { placed: Placement[]; refused: Refusal[] }

const MIN_MS = 60_000

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * The reason a post of `accountId` at `when` breaks a limit against `items`, or null when it is allowed.
 * Only items of the same account count; items with no time are drafts and do not count.
 */
export function checkLimits(accountId: string, when: number, items: StaggerItem[], limits: Record<string, AccountLimits>): string | null {
  const own = items.filter((i) => i.accountId === accountId && i.when != null).map((i) => i.when as number)
  const cap = limits[accountId]?.dailyCap ?? DEFAULT_DAILY_CAP
  const minGap = limits[accountId]?.minGapMin ?? DEFAULT_MIN_GAP_MIN

  const day = new Date(when)
  const onDay = own.filter((t) => sameDay(new Date(t), day)).length
  if (onDay >= cap) return `Daily cap of ${cap} posts reached for ${accountId} on that day.`

  const near = own.find((t) => Math.abs(t - when) < minGap * MIN_MS)
  if (near != null) return `Only ${Math.round(Math.abs(near - when) / MIN_MS)} min from another post of ${accountId}; minimum gap is ${minGap} min.`

  return null
}

/** The moments of the weekly `slots` in the next four weeks after `now`, ascending. */
function upcoming(slots: Slot[], now: Date): number[] {
  const out: number[] = []
  for (let d = 0; d < 28; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    for (const s of slots) if (s.day === day.getDay()) out.push(slotAt(day, s.time))
  }
  return out.filter((t) => t > now.getTime()).sort((a, b) => a - b)
}

/**
 * Places each account's post at slot + index * gapMin, for every upcoming shared slot. A placement that
 * breaks a limit (checked against the queue and the posts already placed) is refused with its reason.
 */
export function staggerPlan(slots: Slot[], accountIds: string[], gapMin: number, limits: Record<string, AccountLimits>, queue: StaggerItem[], now: Date): StaggerPlan {
  const placed: Placement[] = []
  const refused: Refusal[] = []
  const existing: StaggerItem[] = [...queue]

  for (const slot of upcoming(slots, now)) {
    accountIds.forEach((accountId, k) => {
      const when = slot + k * gapMin * MIN_MS
      const reason = checkLimits(accountId, when, existing, limits)
      if (reason) {
        refused.push({ accountId, when, reason })
        return
      }
      placed.push({ accountId, when })
      existing.push({ id: `${accountId}@${when}`, network: '', when, accountId })
    })
  }
  return { placed, refused }
}
