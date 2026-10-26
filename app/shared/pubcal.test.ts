import { describe, expect, it } from 'vitest'
import { cleanItem, problem, stateOf, textFor } from '../electron/social/queue'
import { byDay, checkSlots, moveToDay, nextFreeSlot, weekOf } from './pubcal'

describe('publishing calendar', () => {
  it('lays the queue on a Monday-first week', () => {
    const week = weekOf(new Date(2026, 9, 25, 15, 0))
    expect(week[0]).toEqual(new Date(2026, 9, 19))
    expect(week[6]).toEqual(new Date(2026, 9, 25))
    const items = [{ id: 'a', when: new Date(2026, 9, 21, 18, 0).getTime() }, { id: 'b', when: new Date(2026, 9, 21, 9, 0).getTime() }, { id: 'c', when: null }, { id: 'd', when: new Date(2026, 9, 27, 9, 0).getTime() }]
    expect(byDay(items, week).map((d) => d.map((i) => i.id))).toEqual([[], [], ['b', 'a'], [], [], [], []])
  })

  it('keeps the hour when a post moves to another day', () => {
    expect(new Date(moveToDay(new Date(2026, 9, 21, 18, 30).getTime(), new Date(2026, 9, 23)))).toEqual(new Date(2026, 9, 23, 18, 30))
    expect(new Date(moveToDay(null, new Date(2026, 9, 23)))).toEqual(new Date(2026, 9, 23, 9, 0))
  })

  it('finds the next free preferred slot', () => {
    const slots = [{ day: 1, time: '09:00' }, { day: 3, time: '18:30' }]
    const now = new Date(2026, 9, 25, 15, 0) // a Sunday
    expect(new Date(nextFreeSlot(slots, [], now)!)).toEqual(new Date(2026, 9, 26, 9, 0))
    // Monday 09:10 is taken: Wednesday 18:30 is next
    expect(new Date(nextFreeSlot(slots, [new Date(2026, 9, 26, 9, 10).getTime()], now)!)).toEqual(new Date(2026, 9, 28, 18, 30))
    expect(nextFreeSlot([], [], now)).toBeNull()
    expect(checkSlots([{ day: 2, time: '25:00' }])).toMatch(/not a time/)
  })

  it('checks each network against its own version of the text', () => {
    const long = 'x'.repeat(320)
    const it = cleanItem({ text: long, networks: ['x', 'mastodon'], variants: { x: 'Short for X', linkedin: 'dropped: not a chosen network' } })
    expect(it.variants).toEqual({ x: 'Short for X' })
    expect(textFor(it, 'x')).toBe('Short for X')
    expect(textFor(it, 'mastodon')).toBe(long)
    expect(problem(it, 'x')).toBe('')
    expect(cleanItem({ text: long, networks: ['x'] }) && problem(cleanItem({ text: long, networks: ['x'] }), 'x')).toMatch(/280/)
    const withNotes = cleanItem({ text: 'a', networks: ['x'], comments: [{ at: 1, text: 'check the link' }, { at: 2, text: ' ' }] })
    expect(withNotes.comments).toEqual([{ at: 1, text: 'check the link' }])
    expect(stateOf(withNotes)).toBe('draft')
  })
})
