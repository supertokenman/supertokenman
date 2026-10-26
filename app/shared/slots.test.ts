import { describe, expect, it } from 'vitest'
import { freeSlots, workerScript } from './slots'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString()
describe('scheduling', () => {
  it('finds free slots inside hours, clear of busy time with a buffer', () => {
    const now = new Date(2026, 9, 26, 8, 0) // a Monday, 08:00
    const r = { days: 2, from: '09:00', to: '12:00', minutes: 60, buffer: 15, weekdays: [1, 2, 3, 4, 5], notBeforeHours: 0 }
    const s = freeSlots([{ start: at(26, 10, 0), end: at(26, 10, 30) }], r, now)
    expect(s.map((x) => new Date(x.start).getDate() + '@' + new Date(x.start).getHours())).toEqual(['27@9', '27@10', '27@11'].includes('x') ? [] : ['26@11', '27@9', '27@10', '27@11'])
    expect(freeSlots([], { ...r, weekdays: [0, 6] }, now)).toEqual([])
    expect(freeSlots([], { ...r, days: 1, notBeforeHours: 3 }, now).length).toBe(1)
  })
  it('writes a worker that escapes the title and guards requests with the token', () => {
    const w = workerScript({ title: 'Talk <b>me</b>', who: 'Yuji', minutes: 30, slots: [] })
    expect(w).toContain('Talk &lt;b&gt;me&lt;/b&gt;')
    expect(w).toContain("'Bearer ' + env.TOKEN")
    expect(w).toContain('export default')
    expect(() => new Function(w.replace('export default', 'return'))).not.toThrow()
  })
})
