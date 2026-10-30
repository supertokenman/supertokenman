import { describe, expect, it } from 'vitest'
import { MAX_CHARS, MAX_ITEMS, emptyQueue, estimate, interruptFor, nextToSend, reduce, type PanelQueue, type QueueItem } from './panelqueue'

const item = (id: string, text = `text ${id}`, extra: Partial<QueueItem> = {}): QueueItem => ({ id, text, at: 1, state: 'waiting', ...extra })
const add = (q: PanelQueue, id: string, extra: Partial<QueueItem> = {}) => reduce(q, { t: 'add', item: item(id, undefined, extra) })
const ids = (q: PanelQueue) => q.items.map((x) => x.id)

describe('add', () => {
  it('appends waiting items in order', () => {
    const q = add(add(emptyQueue(), 'a'), 'b')
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.items[0]!.state).toBe('waiting')
  })
  it('puts a steer in front of the waiting items', () => {
    const q = add(add(emptyQueue(), 'a'), 'b', { steer: 'next' })
    expect(ids(q)).toEqual(['b', 'a'])
  })
  it('rejects empty text, text over the cap, and a full queue', () => {
    const q = emptyQueue()
    expect(reduce(q, { t: 'add', item: item('x', '   ') })).toBe(q)
    expect(reduce(q, { t: 'add', item: item('x', 'a'.repeat(MAX_CHARS + 1)) })).toBe(q)
    let full = q
    for (let i = 0; i < MAX_ITEMS; i++) full = add(full, `i${i}`)
    expect(full.items).toHaveLength(MAX_ITEMS)
    expect(add(full, 'extra')).toBe(full)
  })
})

describe('edit, cancel', () => {
  it('edits and cancels waiting items only', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    q = reduce(q, { t: 'edit', id: 'a', text: 'new' })
    expect(q.items[0]!.text).toBe('new')
    q = reduce(q, { t: 'cancel', id: 'a' })
    expect(ids(q)).toEqual(['b'])
  })
  it('refuses empty edits and changes to a sending item', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    q = reduce(q, { t: 'sent', id: 'a' })
    expect(reduce(q, { t: 'edit', id: 'a', text: 'changed' })).toBe(q)
    expect(reduce(q, { t: 'cancel', id: 'a' })).toBe(q)
    expect(reduce(q, { t: 'edit', id: 'b', text: '  ' })).toBe(q)
  })
})

describe('move', () => {
  it('moves a waiting item and clamps the target', () => {
    let q = add(add(add(emptyQueue(), 'a'), 'b'), 'c')
    q = reduce(q, { t: 'move', id: 'c', to: 0 })
    expect(ids(q)).toEqual(['c', 'a', 'b'])
    q = reduce(q, { t: 'move', id: 'c', to: 99 })
    expect(ids(q)).toEqual(['a', 'b', 'c'])
  })
  it('never moves a waiting item in front of a sending item', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    q = reduce(q, { t: 'sent', id: 'a' })
    q = reduce(q, { t: 'move', id: 'b', to: 0 })
    expect(ids(q)).toEqual(['a', 'b'])
  })
})

describe('steer', () => {
  it('moves a waiting item to the head and records the mode', () => {
    let q = add(add(add(emptyQueue(), 'a'), 'b'), 'c')
    q = reduce(q, { t: 'steer', id: 'c', mode: 'interrupt' })
    expect(ids(q)).toEqual(['c', 'a', 'b'])
    expect(q.items[0]!.steer).toBe('interrupt')
  })
  it('keeps a steer behind a sending item', () => {
    let q = add(add(add(emptyQueue(), 'a'), 'b'), 'c')
    q = reduce(q, { t: 'sent', id: 'a' })
    q = reduce(q, { t: 'steer', id: 'c', mode: 'next' })
    expect(ids(q)).toEqual(['a', 'c', 'b'])
  })
})

describe('pause, resume, loaded', () => {
  it('pauses with a reason and resumes clearing it', () => {
    let q = reduce(emptyQueue(), { t: 'pause', reason: 'Budget reached' })
    expect(q).toEqual({ items: [], paused: true, pauseReason: 'Budget reached' })
    q = reduce(q, { t: 'resume' })
    expect(q).toEqual({ items: [], paused: false })
  })
  it('loads paused and returns in-flight items to waiting', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    q = reduce(q, { t: 'sent', id: 'a' })
    q = reduce(q, { t: 'loaded' })
    expect(q.paused).toBe(true)
    expect(q.items.every((x) => x.state === 'waiting')).toBe(true)
    expect(nextToSend(q, false)).toBeNull()
  })
})

describe('turnEnded and sent', () => {
  it('removes the sent item when the turn succeeds', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    q = reduce(q, { t: 'sent', id: 'a' })
    q = reduce(q, { t: 'turnEnded', ok: true })
    expect(ids(q)).toEqual(['b'])
    expect(q.paused).toBe(false)
  })
  it('keeps the text and pauses when the turn fails', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    q = reduce(q, { t: 'sent', id: 'a' })
    q = reduce(q, { t: 'turnEnded', ok: false })
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.items[0]!.state).toBe('waiting')
    expect(q.paused).toBe(true)
    expect(q.pauseReason).toBeTruthy()
  })
  it('does not pause an empty queue on a failed turn', () => {
    const q = emptyQueue()
    expect(reduce(q, { t: 'turnEnded', ok: false })).toBe(q)
  })
  it('marks only waiting items as sending', () => {
    const q = add(emptyQueue(), 'a')
    expect(reduce(q, { t: 'sent', id: 'zz' })).toBe(q)
    expect(reduce(reduce(q, { t: 'sent', id: 'a' }), { t: 'sent', id: 'a' }).items[0]!.state).toBe('sending')
  })
})

describe('nextToSend and interruptFor', () => {
  it('returns the head only when idle, not paused and nothing is in flight', () => {
    const q = add(add(emptyQueue(), 'a'), 'b')
    expect(nextToSend(q, false)?.id).toBe('a')
    expect(nextToSend(q, true)).toBeNull()
    expect(nextToSend(reduce(q, { t: 'pause' }), false)).toBeNull()
    expect(nextToSend(reduce(q, { t: 'sent', id: 'a' }), false)).toBeNull()
    expect(nextToSend(emptyQueue(), false)).toBeNull()
  })
  it('asks for an interrupt only for a head interrupt steer during a turn', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    expect(interruptFor(q, true)).toBeNull()
    q = reduce(q, { t: 'steer', id: 'b', mode: 'interrupt' })
    expect(interruptFor(q, true)?.id).toBe('b')
    expect(interruptFor(q, false)).toBeNull()
    expect(interruptFor(reduce(q, { t: 'pause' }), true)).toBeNull()
  })
})

describe('estimate', () => {
  it('reports unknown cost with no history', () => {
    const q = add(add(add(emptyQueue(), 'a'), 'b'), 'c')
    expect(estimate(q, [])).toEqual({ turns: 3, usd: null })
    expect(estimate(q, [Number.NaN, -1])).toEqual({ turns: 3, usd: null })
  })
  it('uses the median of the last 10 turn costs', () => {
    const q = add(add(add(emptyQueue(), 'a'), 'b'), 'c')
    const e = estimate(q, [100, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
    // the last 10 are 0.1..1.0 (100 is older than the window); their median is (0.5 + 0.6) / 2
    expect(e.turns).toBe(3)
    expect(e.usd).toBeCloseTo(0.55 * 3)
  })
  it('counts only waiting items as turns', () => {
    let q = add(add(emptyQueue(), 'a'), 'b')
    q = reduce(q, { t: 'sent', id: 'a' })
    expect(estimate(q, [2]).turns).toBe(1)
    expect(estimate(q, [2]).usd).toBe(2)
  })
})
