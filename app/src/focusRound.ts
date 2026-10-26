// Time and focus, as pure functions: minute ticks into a daily log, the length of the current
// stretch of work, and the state of a focus round or a break.

/** minutes per day, per project: yours (you were active) and Claude's (a panel was working) */
export type TimeLog = Record<string, Record<string, { you: number; claude: number }>>

export type Focus = { goal: string; sid: string | null; startedAt: number; minutes: number; kind: 'focus' | 'break' }

export const ACTIVE_GAP_MS = 5 * 60 * 1000
export const day = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** One minute: adds yours where you were active, and Claude's where a panel worked. */
export function tick(log: TimeLog, now: number, panels: { project: string; youActive: boolean; claudeBusy: boolean }[]): TimeLog {
  const d = day(now)
  const today = { ...(log[d] ?? {}) }
  // a minute of yours counts once, for the project you touched last
  const mine = panels.find((p) => p.youActive)
  if (mine) today[mine.project] = { you: (today[mine.project]?.you ?? 0) + 1, claude: today[mine.project]?.claude ?? 0 }
  for (const p of new Set(panels.filter((x) => x.claudeBusy).map((x) => x.project)))
    today[p] = { you: today[p]?.you ?? 0, claude: (today[p]?.claude ?? 0) + 1 }
  return { ...log, [d]: today }
}

/** Totals for the last `days` days ending today, by project, largest first. */
export function summary(log: TimeLog, now: number, days = 1) {
  const by: Record<string, { you: number; claude: number }> = {}
  for (let i = 0; i < days; i++) {
    for (const [p, v] of Object.entries(log[day(now - i * 86400000)] ?? {})) {
      by[p] = { you: (by[p]?.you ?? 0) + v.you, claude: (by[p]?.claude ?? 0) + v.claude }
    }
  }
  const rows = Object.entries(by)
    .map(([project, v]) => ({ project, ...v }))
    .sort((a, b) => b.you + b.claude - (a.you + a.claude))
  return { rows, you: rows.reduce((n, r) => n + r.you, 0), claude: rows.reduce((n, r) => n + r.claude, 0) }
}

/** How long you have worked without a pause of ACTIVE_GAP_MS, from your activity times. */
export function stretch(activity: number[], now: number): number {
  const t = [...activity].sort((a, b) => a - b).filter((x) => x <= now)
  if (!t.length || now - t[t.length - 1]! > ACTIVE_GAP_MS) return 0
  let start = t[t.length - 1]!
  for (let i = t.length - 1; i > 0; i--) {
    if (t[i]! - t[i - 1]! > ACTIVE_GAP_MS) break
    start = t[i - 1]!
  }
  return now - start
}

/** Where a round stands: time left, and whether it is over. */
export function roundState(f: Focus, now: number) {
  const total = f.minutes * 60000
  const left = Math.max(0, f.startedAt + total - now)
  return { left, done: left === 0, progress: Math.min(1, (now - f.startedAt) / total) }
}

export const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`)
