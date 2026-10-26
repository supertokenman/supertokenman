import { describe, expect, it } from 'vitest'
import * as C from './calendar'

const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:standup
DTSTART;TZID=America/Sao_Paulo:20261019T093000
DTEND;TZID=America/Sao_Paulo:20261019T094500
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
EXDATE;TZID=America/Sao_Paulo:20261021T093000
SUMMARY:Daily standup
X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID;TZID=America/Sao_Paulo:20261023T093000
DTSTART;TZID=America/Sao_Paulo:20261023T110000
DTEND;TZID=America/Sao_Paulo:20261023T111500
SUMMARY:Daily standup (moved)
END:VEVENT
BEGIN:VEVENT
UID:review
DTSTART:20261023T180000Z
DTEND:20261023T190000Z
SUMMARY:Review\\, sprint 42
DESCRIPTION:Join: https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=1
 continues here
END:VEVENT
BEGIN:VEVENT
UID:off
DTSTART;VALUE=DATE:20261023
DTEND;VALUE=DATE:20261024
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
UID:gone
DTSTART:20261023T150000Z
DTEND:20261023T160000Z
STATUS:CANCELLED
SUMMARY:Cancelled thing
END:VEVENT
END:VCALENDAR`

describe('calendar', () => {
  it('converts zone wall time to UTC', () => {
    expect(C.zonedToUtc(2026, 10, 23, 9, 30, 0, 'America/Sao_Paulo').toISOString()).toBe('2026-10-23T12:30:00.000Z')
  })
  it('expands the week, skips exceptions, takes moved ones, drops cancelled', () => {
    const from = new Date('2026-10-19T00:00:00Z')
    const to = new Date('2026-10-24T03:00:00Z')
    const ev = C.parseIcs(ics, 'Work', from, to)
    const standups = ev.filter((e) => e.title.startsWith('Daily standup'))
    expect(standups.map((e) => e.start)).toEqual(['2026-10-19T12:30:00.000Z', '2026-10-20T12:30:00.000Z', '2026-10-22T12:30:00.000Z', '2026-10-23T14:00:00.000Z'])
    expect(standups[3]!.title).toBe('Daily standup (moved)')
    expect(standups[0]!.join).toBe('https://meet.google.com/abc-defg-hij')
    const review = ev.find((e) => e.title === 'Review, sprint 42')!
    expect(review.join).toBe('https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=1continues')
    expect(ev.some((e) => e.title === 'Holiday' && e.allDay)).toBe(true)
    expect(ev.some((e) => e.title === 'Cancelled thing')).toBe(false)
  })
  it('finds the next meeting', () => {
    const ev = C.parseIcs(ics, 'Work', new Date('2026-10-23T00:00:00Z'), new Date('2026-10-24T03:00:00Z'))
    const n = C.nextUp(ev, new Date('2026-10-23T13:52:00Z'))
    expect(n?.event.title).toBe('Daily standup (moved)')
    expect(n?.inMin).toBe(8)
  })
  it('handles COUNT, UNTIL and monthly', () => {
    const s = new Date(2026, 0, 31, 10)
    expect(C.occurrences(s, 'FREQ=MONTHLY', new Date(2026, 0, 1), new Date(2026, 5, 1)).map((d) => d.getMonth())).toEqual([0, 2, 4])
    expect(C.occurrences(new Date(2026, 9, 1, 9), 'FREQ=DAILY;COUNT=3', new Date(2026, 9, 1), new Date(2026, 9, 30))).toHaveLength(3)
  })
})
