// The publishing calendar, the parts with no network: the days of a week, the queue laid out on them,
// a time moved to another day keeping its hour, the person's preferred time slots and the next one
// free. The idea of a week grid with slots is Postiz's (AGPL-3.0); no code is taken from it.

export type Slot = { day: number; time: string }
export type Placed = { id: string; when: number | null }

/** The Monday-first week holding `d`, as seven local midnights. */
export function weekOf(d: Date): Date[] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** The items of each day of the week, by time; items with no time are left out (they are drafts). */
export function byDay<T extends Placed>(items: T[], week: Date[]): T[][] {
  return week.map((day) => items.filter((i) => i.when != null && sameDay(new Date(i.when), day)).sort((a, b) => a.when! - b.when!))
}

/** A time dropped on another day: the same hour and minute on that day; a draft lands at 09:00. */
export function moveToDay(when: number | null, day: Date): number {
  const from = when != null ? new Date(when) : null
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), from ? from.getHours() : 9, from ? from.getMinutes() : 0).getTime()
}

/** A slot's moment on a given day. */
export function slotAt(day: Date, time: string): number {
  const [h, m] = time.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 9, m ?? 0).getTime()
}

export function checkSlots(slots: Slot[]): string | null {
  for (const s of slots) {
    if (!(s.day >= 0 && s.day <= 6)) return 'A slot needs a weekday.'
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) return `${s.time} is not a time; write HH:MM.`
  }
  return null
}

/**
 * The next preferred slot after `now` that no queued item takes (within 30 minutes of it), looking up
 * to four weeks ahead; null when there are no slots.
 */
export function nextFreeSlot(slots: Slot[], taken: (number | null)[], now: Date): number | null {
  if (!slots.length) return null
  const busy = taken.filter((t): t is number => t != null)
  for (let d = 0; d < 28; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    const times = slots.filter((s) => s.day === day.getDay()).map((s) => slotAt(day, s.time)).sort((a, b) => a - b)
    for (const t of times) if (t > now.getTime() && !busy.some((b) => Math.abs(b - t) < 30 * 60_000)) return t
  }
  return null
}

/** Characters left for a network's limit, for the counter under each version. */
export const LIMITS: Record<string, number> = { x: 280, bluesky: 300, threads: 500, mastodon: 500, linkedin: 3000, instagram: 2200, facebook: 63206, tiktok: 2200, youtube: 5000 }
