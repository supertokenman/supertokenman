// The coach: local rules that read a panel's state and say when to compact, when the cache is about
// to go cold, when a cheaper model would do, and when the plan window is running out. No model calls.
import type { State } from './state'

export type Tip = {
  id: string
  tone: 'info' | 'warn'
  title: string
  body: string
  action?: { label: string; prompt: string }
  /** how full the thing is, 0..1, drawn as a ring instead of explained in words */
  meter?: number
  /** the ring's center: a number or a short code */
  mark?: string
}

const EXPLORE = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'])
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/** `extra.stretch`: how long you have worked without a pause, in ms; `extra.focus`: a focus round is on. */
export function coach(s: State, now = Date.now(), extra: { stretch?: number; focus?: boolean } = {}): Tip[] {
  const tips: Tip[] = []
  const ctx = s.context
  const idleMin = s.lastTurnAt == null ? null : (now - s.lastTurnAt) / 60000

  // the cache: an hour from the last reply; a cold one makes the next message re-read everything at full price
  if (ctx && idleMin != null && !s.busy && ctx.tokens >= 20000) {
    if (idleMin >= 60)
      tips.push({ id: 'cache-cold', tone: 'warn', meter: 0, mark: '0', title: 'Prompt cache is cold', body: `Your next message re-reads ${k(ctx.tokens)} tokens at full price. If it is a new topic, compact first or open a new panel.`, action: { label: 'Compact', prompt: '/compact' } })
    else if (idleMin >= 50)
      tips.push({ id: 'cache-ending', tone: 'info', meter: Math.max(0, 60 - idleMin) / 10, mark: String(Math.max(1, Math.round(60 - idleMin))), title: `Cache ends in ${Math.max(1, Math.round(60 - idleMin))} min`, body: 'Reply before then to keep the session cheap, or compact if you are done with this topic.' })
  }

  // a full context costs more on every request and gets compacted anyway
  if (ctx && ctx.percent >= 60)
    tips.push({ id: 'ctx-high', tone: ctx.percent >= 80 ? 'warn' : 'info', meter: ctx.percent / 100, mark: `${Math.round(ctx.percent)}`, title: `Context at ${Math.round(ctx.percent)}%`, body: 'Every request re-reads all of it. Compact now and keep a summary, or open a fresh panel for the next task.', action: { label: 'Compact', prompt: '/compact' } })

  // a top model reading files: a cheaper one explores just as well
  const recent = s.lines.filter((l) => l.kind === 'tool').slice(-8)
  if (/opus|fable/.test(s.model) && recent.length >= 6 && recent.every((l) => l.kind === 'tool' && EXPLORE.has(l.name)))
    tips.push({ id: 'explore-model', tone: 'info', title: 'Exploring on a top model', body: 'The last steps only read and searched. A Haiku or Sonnet panel does that for a fraction of the cost; keep this one for the changes.' })

  // the plan windows
  for (const [key, label] of [['five_hour', '5-hour'], ['seven_day', '7-day']] as const) {
    const l = s.limits[key]
    if (l && l.percentUsed >= 80) {
      const at = l.resetsAt ? new Date(l.resetsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
      tips.push({ id: `limit-${key}`, tone: 'warn', meter: l.percentUsed / 100, mark: key === 'five_hour' ? '5H' : '7D', title: `${label} window at ${Math.round(l.percentUsed)}%`, body: `${at ? `Resets at ${at}. ` : ''}Prefer cheaper models and fewer panels until then.` })
    }
  }
  // a long stretch without a pause
  if ((extra.stretch ?? 0) >= 90 * 60000) {
    const h = Math.floor((extra.stretch ?? 0) / 3600000)
    const m = Math.round(((extra.stretch ?? 0) % 3600000) / 60000)
    tips.push({ id: 'break', tone: 'warn', meter: Math.min(1, (extra.stretch ?? 0) / (180 * 60000)), mark: `${h}h`, title: `${h}h${String(m).padStart(2, '0')} without a pause`, body: 'Five minutes away from the screen pays for itself. The panels keep working.' })
  }
  // during a focus round only what is urgent shows
  return extra.focus ? tips.filter((t) => t.tone === 'warn') : tips
}
