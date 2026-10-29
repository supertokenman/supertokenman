import { describe, expect, it } from 'vitest'
import type { Item } from '../electron/social/queue.js'
import { GRACE_MS, catchUp, missed } from './missed.js'

const NOW = Date.UTC(2026, 9, 29, 12, 0)
const item = (id: string, over: Partial<Item> = {}): Item =>
  ({ id, text: 'hi', networks: ['bluesky'], when: NOW, approved: true, createdAt: NOW, results: {}, ...over }) as Item

describe('missed', () => {
  it('inside grace posts', () => {
    expect(GRACE_MS).toBe(15 * 60_000)
    const soon = item('a', { when: NOW - 14 * 60_000 })
    const edge = item('b', { when: NOW - GRACE_MS })
    const { postNow, held } = catchUp([soon, edge], NOW)
    expect(postNow.map((i) => i.id)).toEqual(['a', 'b'])
    expect(held).toEqual([])
  })

  it('outside grace is held', () => {
    const late = item('a', { when: NOW - GRACE_MS - 1 })
    const { postNow, held } = catchUp([late], NOW)
    expect(postNow).toEqual([])
    expect(held.map((i) => i.id)).toEqual(['a'])
    expect(missed([late], NOW)).toEqual([late])
  })

  it('unapproved is ignored', () => {
    const draft = item('a', { approved: false, when: NOW - 60_000 })
    const future = item('b', { when: NOW + 60_000 })
    const done = item('c', { when: NOW - 60_000, results: { bluesky: { ok: true, at: NOW } } })
    const untimed = item('d', { when: null })
    expect(missed([draft, future, done, untimed], NOW)).toEqual([])
    expect(catchUp([draft, future, done, untimed], NOW)).toEqual({ postNow: [], held: [] })
  })
})
