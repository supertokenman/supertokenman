// A trigger's schedule as the team bundle writes it (the same words as triggers.describe), read back.
import { DAYS, EVERY, type When } from './triggers.js'

/** The schedule for a bundle's "when" text; null when it is not one of the forms describe() writes. */
export function parseWhen(text: string): When | null {
  const t = text.trim()
  if (t === 'When a PR waits on your review') return { kind: 'pr-review' }
  const ev = /^Every (\d+) (min|h)$/.exec(t)
  if (ev) {
    const minutes = Number(ev[1]) * (ev[2] === 'h' ? 60 : 1)
    return EVERY.includes(minutes) ? { kind: 'every', minutes } : null
  }
  const at = /^(.*) at (\d{2}):(\d{2})$/.exec(t)
  if (!at || Number(at[2]) > 23 || Number(at[3]) > 59) return null
  const named: Record<string, number[]> = { 'Every day': [0, 1, 2, 3, 4, 5, 6], 'Mon to Fri': [1, 2, 3, 4, 5], Weekends: [0, 6] }
  const days = named[at[1]!] ?? at[1]!.split(', ').map((d) => DAYS.indexOf(d))
  if (!days.length || days.some((d) => d < 0)) return null
  return { kind: 'schedule', days: [...new Set(days)].sort(), time: `${at[2]}:${at[3]}` }
}
