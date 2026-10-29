import { describe, expect, it } from 'vitest'
import { nextSlotFor, replan, type NetSlots, type SlotItem } from './postslots'

// 2026-10-25 is a Sunday; Oct 26 is Monday (day 1), Oct 27 Tuesday, Oct 28 Wednesday
const now = new Date(2026, 9, 25, 15, 0)
const t = (day: number, h: number, m = 0, month = 9) => new Date(2026, month, day, h, m).getTime()

describe('post slots', () => {
  it('next free slot per network', () => {
    const slots: NetSlots = { x: [{ day: 1, time: '09:00' }], bluesky: [{ day: 3, time: '18:30' }] }
    const queue: SlotItem[] = [{ id: 'a', network: 'x', when: t(26, 9) }]
    // x's Monday 09:00 is taken by its own item: next Monday; bluesky is not blocked by x
    expect(nextSlotFor(slots, 'x', queue, now)).toBe(t(2, 9, 0, 10))
    expect(nextSlotFor(slots, 'bluesky', queue, now)).toBe(t(28, 18, 30))
    expect(nextSlotFor({}, 'x', queue, now)).toBeNull()
  })

  it('replan keeps hand-picked times', () => {
    const slots: NetSlots = { x: [{ day: 2, time: '10:00' }] }
    const queue: SlotItem[] = [
      { id: 'a', network: 'x', when: t(26, 9) }, // slot-placed, moves
      { id: 'b', network: 'x', when: t(27, 10), hand: true }, // picked by hand, stays
      { id: 'c', network: 'x', when: null }, // draft, stays
    ]
    const out = replan(slots, queue, now)
    expect(out.map((i) => i.when)).toEqual([t(3, 10, 0, 10), t(27, 10), null])
    expect(out[1]).toBe(queue[1])
    expect(queue[0].when).toBe(t(26, 9)) // input not changed
  })

  it('day off has no slots', () => {
    // only Mondays: Tuesday to Sunday are days off
    const slots: NetSlots = { x: [{ day: 1, time: '09:00' }], y: [] }
    expect(nextSlotFor(slots, 'x', [], now)).toBe(t(26, 9))
    expect(nextSlotFor(slots, 'x', [{ id: 'a', network: 'x', when: t(26, 9) }], now)).toBe(t(2, 9, 0, 10))
    expect(nextSlotFor(slots, 'y', [], now)).toBeNull()
    // a slot-placed item on a day now off moves to the next Monday slot
    const out = replan(slots, [{ id: 'a', network: 'x', when: t(28, 9) }], now)
    expect(out[0].when).toBe(t(26, 9))
    expect(new Date(out[0].when!).getDay()).toBe(1)
  })
})
