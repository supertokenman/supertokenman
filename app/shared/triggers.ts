// Triggers: a persona that starts on its own. On a schedule (days and a time), every N minutes, or
// when a pull request starts waiting on your review. The app has to be running (it lives in the menu
// bar when its window is closed); a trigger whose time passed while the Mac slept runs once on wake.

import { cleanScope } from './triggerscope.js'

export type When =
  | { kind: 'schedule'; days: number[]; time: string }
  | { kind: 'every'; minutes: number }
  | { kind: 'pr-review' }

export type Trigger = {
  id: string
  name: string
  /** persona id; '' runs a plain panel */
  persona: string
  cwd: string
  prompt: string
  when: When
  enabled: boolean
  lastRun?: number
  /** when it was saved: a new or changed schedule counts from here */
  armedAt?: number
  /** asks before its first step runs */
  gate?: boolean
  /** waits for business hours (the one inbox's hours) before it runs */
  hoursOnly?: boolean
  /** folders it may read or write and commands it may run; the app refuses the rest */
  scope?: import('./triggerscope.js').Scope
  /** starts from a POST to the app's 127.0.0.1 receiver with this trigger's token (shared/webhook.ts) */
  webhook?: boolean
  /** consecutive failed runs (shared/routinecaps.ts); a success resets it */
  failures?: number
  /** set when the app switched it off after too many failed runs */
  disabledReason?: 'failures'
  note?: string
}

export const EVERY = [15, 30, 60, 120, 240, 480]
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const at = (d: Date, time: string) => {
  const [h = 9, m = 0] = time.split(':').map(Number)
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x
}

/** The next time a timed trigger runs after `from`; null for event triggers or an empty schedule. */
export function nextRun(w: When, from: number): number | null {
  if (w.kind === 'every') return from + w.minutes * 60_000
  if (w.kind !== 'schedule' || !w.days.length) return null
  const base = new Date(from)
  for (let i = 0; i < 8; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const t = at(d, w.time)
    if (w.days.includes(t.getDay()) && t.getTime() > from) return t.getTime()
  }
  return null
}

/** A timed trigger is due when its next run after the last one has come; a new one waits for its first slot. */
export function isDue(t: Trigger, now: number): boolean {
  if (!t.enabled || t.when.kind === 'pr-review') return false
  const known = t.lastRun != null || t.armedAt != null
  const after = known ? Math.max(t.lastRun ?? 0, t.armedAt ?? 0) : t.when.kind === 'every' ? now - 1 : now - 60_000
  const next = nextRun(t.when, after)
  return next != null && next <= now
}

/** Pull requests that started waiting on you since the last look; the first look only takes note. */
export function newReviews(seen: Set<string> | null, keys: string[]): { fresh: string[]; seen: Set<string> } {
  const now = new Set(keys)
  if (!seen) return { fresh: [], seen: now }
  return { fresh: keys.filter((k) => !seen.has(k)), seen: now }
}

export function cleanTrigger(t: Partial<Trigger>, minEvery = 15): Trigger {
  const w = t.when ?? { kind: 'schedule', days: [1, 2, 3, 4, 5], time: '09:00' }
  const when: When =
    w.kind === 'every'
      ? { kind: 'every', minutes: EVERY.includes(Number(w.minutes)) ? Math.max(Number(w.minutes), minEvery) : 60 }
      : w.kind === 'pr-review'
        ? { kind: 'pr-review' }
        : { kind: 'schedule', days: [...new Set((w.days ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort(), time: /^\d{2}:\d{2}$/.test(w.time ?? '') ? w.time! : '09:00' }
  return {
    id: t.id && /^[a-z0-9-]{1,40}$/.test(t.id) ? t.id : `t${Date.now().toString(36)}`,
    name: String(t.name ?? '').trim().slice(0, 60) || 'Trigger',
    persona: String(t.persona ?? '').slice(0, 40),
    cwd: String(t.cwd ?? ''),
    prompt: String(t.prompt ?? '').trim().slice(0, 4000),
    when,
    enabled: t.enabled !== false,
    lastRun: typeof t.lastRun === 'number' ? t.lastRun : undefined,
    armedAt: typeof t.armedAt === 'number' ? t.armedAt : undefined,
    gate: t.gate === true,
    hoursOnly: t.hoursOnly === true,
    scope: cleanScope(t.scope),
    webhook: t.webhook === true,
    ...(typeof t.failures === 'number' && t.failures > 0 ? { failures: Math.floor(t.failures) } : {}),
    ...(t.disabledReason === 'failures' ? { disabledReason: 'failures' as const } : {}),
    ...(typeof t.note === 'string' && t.note ? { note: t.note.slice(0, 300) } : {}),
  }
}

/** One line for the list: "Mon to Fri at 09:00", "Every 30 min", "When a PR waits on your review". */
export function describe(w: When): string {
  if (w.kind === 'every') return w.minutes < 60 ? `Every ${w.minutes} min` : `Every ${w.minutes / 60} h`
  if (w.kind === 'pr-review') return 'When a PR waits on your review'
  const d = [...w.days].sort()
  const days = d.length === 7 ? 'Every day' : d.join() === '1,2,3,4,5' ? 'Mon to Fri' : d.join() === '0,6' ? 'Weekends' : d.map((x) => DAYS[x]).join(', ') || 'No days'
  return `${days} at ${w.time}`
}
