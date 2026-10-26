// The day's edges: where each panel stopped, kept so tomorrow starts where today ended.
import type { Panels } from './state'

export type Stop = { cwd: string; sessionId?: string; last: string; at: number; costUsd: number; turns: number }
export type DayLog = { date: string; stops: Stop[] }

export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Each open panel that did something: its folder, session and the first line of its last answer. */
export function snapshot(p: Panels, now = Date.now()): Stop[] {
  return p.order
    .map((sid) => p.byId[sid])
    .filter((s): s is NonNullable<typeof s> => !!s && s.turns > 0)
    .map((s) => {
      const last = [...s.lines].reverse().find((l) => l.kind === 'assistant')
      const text = last && last.kind === 'assistant' ? last.text.split('\n').find((l) => l.trim()) ?? '' : ''
      return { cwd: s.cwd, sessionId: s.sessionId, last: text.replace(/^#+\s*/, '').slice(0, 160), at: s.lastTurnAt ?? now, costUsd: s.costUsd, turns: s.turns }
    })
}

/** Today's log merged in: a folder's newer stop replaces its older one. */
export function record(logs: DayLog[], stops: Stop[], today = dateKey()): DayLog[] {
  if (!stops.length) return logs
  const cur = logs.find((l) => l.date === today) ?? { date: today, stops: [] }
  const byCwd = new Map(cur.stops.map((s) => [s.cwd, s]))
  for (const s of stops) if (!byCwd.has(s.cwd) || byCwd.get(s.cwd)!.at <= s.at) byCwd.set(s.cwd, s)
  return [{ date: today, stops: [...byCwd.values()].sort((a, b) => b.at - a.at) }, ...logs.filter((l) => l.date !== today)].slice(0, 14)
}

/** The last day before today that has stops. */
export const lastDay = (logs: DayLog[], today = dateKey()) => logs.find((l) => l.date < today && l.stops.length) ?? null
