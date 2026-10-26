// The day's meetings from calendars' secret iCal addresses (Google Calendar and Outlook both give one):
// no API, no app registration, no cost. Parses VEVENT with time zones, all-day events, the common
// recurrence rules (daily, weekly by day, monthly by date) and their exceptions, and finds the join link.

export type Event = { id: string; title: string; start: string; end: string; allDay: boolean; where?: string; join?: string; calendar: string }

/** RFC 5545 lines: a line starting with a space continues the one before. */
const unfold = (ics: string) => ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

/** The UTC instant of a wall-clock time in a time zone. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let offset = 0
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value]),
    )
    const asIfUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
    offset = asIfUtc - guess
  } catch {
    // an unknown zone name: read the time as UTC rather than drop the event
  }
  return new Date(guess - offset)
}

/** A DTSTART/DTEND value with its parameters, as an instant; all-day dates as local midnight. */
export function parseWhen(params: string, value: string): { date: Date; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (!m) return { date: new Date(NaN), allDay: false }
  const [, y, mo, d, h, mi, s, z] = m
  if (!h) return { date: new Date(+y!, +mo! - 1, +d!), allDay: true }
  if (z) return { date: new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!, +s!)), allDay: false }
  const tz = params.match(/TZID=([^;:]+)/)?.[1]?.replace(/^"|"$/g, '')
  if (tz) return { date: zonedToUtc(+y!, +mo!, +d!, +h, +mi!, +s!, tz), allDay: false }
  return { date: new Date(+y!, +mo! - 1, +d!, +h, +mi!, +s!), allDay: false }
}

const JOIN = /https:\/\/(?:meet\.google\.com\/[a-z-]+|[\w.-]*zoom\.us\/j\/[^\s"<>]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+|teams\.live\.com\/meet\/[^\s"<>]+|[\w.-]*whereby\.com\/[^\s"<>]+|app\.slack\.com\/huddle\/[^\s"<>]+)/i
export const joinLink = (...texts: (string | undefined)[]) => texts.map((t) => t?.match(JOIN)?.[0]).find(Boolean)

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Every occurrence of a recurring start within [from, to): DAILY, WEEKLY (BYDAY), MONTHLY by date. */
export function occurrences(start: Date, rrule: string, from: Date, to: Date, exdates: number[] = []): Date[] {
  const r = Object.fromEntries(rrule.split(';').map((p) => p.split('=') as [string, string]))
  const interval = Math.max(1, Number(r.INTERVAL ?? 1))
  const until = r.UNTIL ? parseWhen('', r.UNTIL).date : null
  const count = r.COUNT ? Number(r.COUNT) : Infinity
  const byday = r.BYDAY ? r.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))) : null
  const out: Date[] = []
  let n = 0
  const take = (d: Date) => {
    if (until && d > until) return false
    if (n >= count) return false
    n++
    if (d >= from && d < to && !exdates.includes(d.getTime())) out.push(d)
    return true
  }
  const step = (d: Date, days: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + days)
    return x
  }
  // walk at most ~3 years of occurrences; enough for any calendar view
  if (r.FREQ === 'DAILY') {
    for (let d = new Date(start), i = 0; i < 1200 && d < to; d = step(d, interval), i++) if (!take(d)) break
  } else if (r.FREQ === 'WEEKLY') {
    const days = byday ?? [start.getDay()]
    const weekStart = step(start, -start.getDay())
    outer: for (let w = 0; w < 200; w += interval) {
      for (const wd of [...days].sort()) {
        const d = step(weekStart, w * 7 + wd)
        d.setHours(start.getHours(), start.getMinutes(), start.getSeconds())
        if (d < start) continue
        if (d >= to) break outer
        if (!take(d)) break outer
      }
    }
  } else if (r.FREQ === 'MONTHLY') {
    for (let i = 0; i < 48; i += interval) {
      const d = new Date(start)
      d.setMonth(start.getMonth() + i)
      if (d.getDate() !== start.getDate()) continue
      if (d >= to) break
      if (!take(d)) break
    }
  } else {
    take(start)
  }
  return out
}

/** Events of an iCal document that touch [from, to), recurring ones expanded, sorted by start. */
export function parseIcs(ics: string, calendar: string, from: Date, to: Date): Event[] {
  const out: Event[] = []
  const overrides = new Map<string, Set<number>>()
  const blocks = unfold(ics).split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]!)
  const fields = (b: string) => {
    const f: Record<string, { params: string; value: string }[]> = {}
    for (const line of b.split('\n')) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/)
      if (m) (f[m[1]!] ??= []).push({ params: m[2]!, value: m[3]! })
    }
    return f
  }
  const parsed = blocks.map(fields)
  // a RECURRENCE-ID event replaces one occurrence of its series
  for (const f of parsed) {
    const rid = f['RECURRENCE-ID']?.[0]
    if (rid && f.UID?.[0]) {
      const set = overrides.get(f.UID[0].value) ?? new Set<number>()
      set.add(parseWhen(rid.params, rid.value).date.getTime())
      overrides.set(f.UID[0].value, set)
    }
  }
  for (const f of parsed) {
    if (f.STATUS?.[0]?.value === 'CANCELLED') continue
    const ds = f.DTSTART?.[0]
    if (!ds) continue
    const start = parseWhen(ds.params, ds.value)
    if (Number.isNaN(start.date.getTime())) continue
    const de = f.DTEND?.[0]
    const end = de ? parseWhen(de.params, de.value).date : new Date(start.date.getTime() + (start.allDay ? 86_400_000 : 3_600_000))
    const length = end.getTime() - start.date.getTime()
    const title = unescape(f.SUMMARY?.[0]?.value ?? '(no title)')
    const where = f.LOCATION?.[0] ? unescape(f.LOCATION[0].value) : undefined
    const desc = f.DESCRIPTION?.[0] ? unescape(f.DESCRIPTION[0].value) : undefined
    const join = joinLink(f['X-GOOGLE-CONFERENCE']?.[0]?.value, where, f.URL?.[0]?.value, desc)
    const uid = f.UID?.[0]?.value ?? title
    const ex = (f.EXDATE ?? []).flatMap((e) => e.value.split(',').map((v) => parseWhen(e.params, v).date.getTime()))
    const rrule = f.RRULE?.[0]?.value
    const isOverride = !!f['RECURRENCE-ID']
    const starts = rrule && !isOverride ? occurrences(start.date, rrule, new Date(from.getTime() - length), to, [...ex, ...(overrides.get(uid) ?? [])]) : [start.date]
    for (const s of starts) {
      const e = new Date(s.getTime() + length)
      if (e <= from || s >= to) continue
      out.push({ id: `${uid}@${s.getTime()}`, title, start: s.toISOString(), end: e.toISOString(), allDay: start.allDay, where, join, calendar })
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** The next meeting that has not ended, and how many minutes until it starts (negative: running). */
export function nextUp(events: Event[], now = new Date()): { event: Event; inMin: number } | null {
  const e = events.find((x) => !x.allDay && Date.parse(x.end) > now.getTime())
  return e ? { event: e, inMin: Math.round((Date.parse(e.start) - now.getTime()) / 60000) } : null
}

export async function fetchCalendars(urls: { name: string; url: string }[], from: Date, to: Date): Promise<{ events: Event[]; errors: { calendar: string; error: string }[] }> {
  const res = await Promise.allSettled(
    urls.map(async (c) => {
      const u = c.url.replace(/^webcal:/i, 'https:')
      if (!/^https:\/\//.test(u)) throw new Error('needs an https or webcal address')
      const r = await fetch(u, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'SuperTokenMan' } })
      if (!r.ok) throw new Error(`answered ${r.status}`)
      return parseIcs(await r.text(), c.name, from, to)
    }),
  )
  return {
    events: res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => a.start.localeCompare(b.start)),
    errors: res.flatMap((r, i) => (r.status === 'rejected' ? [{ calendar: urls[i]!.name, error: (r.reason as Error).message }] : [])),
  }
}
