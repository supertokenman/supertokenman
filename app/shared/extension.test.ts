import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createScope, Extensions } from './extension'

describe('extension scope', () => {
  it('leaves nothing behind after dispose', async () => {
    vi.useFakeTimers()
    const bus = new EventEmitter()
    const proc = { killed: false }
    const ticks: number[] = []
    const exts = new Extensions()
    await exts.activate({
      id: 'fake',
      activate(s) {
        s.on(bus, 'ping', () => ticks.push(1))
        s.every(1000, () => ticks.push(2))
        s.own(() => (proc.killed = true), 'process')
      },
    })
    expect(exts.list()[0]!.held).toEqual({ listeners: 1, timers: 1, owned: 1 })
    bus.emit('ping'); vi.advanceTimersByTime(1000)
    expect(ticks).toEqual([1, 2])
    expect(await exts.dispose('fake')).toEqual([])
    bus.emit('ping'); vi.advanceTimersByTime(5000)
    expect(ticks).toEqual([1, 2])
    expect(bus.listenerCount('ping')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(proc.killed).toBe(true)
    expect(exts.list()).toEqual([])
    vi.useRealTimers()
  })
  it('a failed start is rolled back', async () => {
    const bus = new EventEmitter()
    const exts = new Extensions()
    await expect(exts.activate({ id: 'bad', activate(s) { s.on(bus, 'x', () => {}); throw new Error('boom') } })).rejects.toThrow('boom')
    expect(bus.listenerCount('x')).toBe(0)
    expect(exts.list()).toEqual([])
  })
  it('keeps releasing when one release throws, and refuses new work after', () => {
    const s = createScope('x')
    let b = false
    s.own(() => { throw new Error('no') }, 'watcher')
    s.own(() => (b = true), 'server')
    expect(s.dispose()).toEqual(['watcher'])
    expect(b).toBe(true)
    expect(() => s.after(10, () => {})).toThrow(/turned off/)
  })
  it('a fired one-off timer is no longer held', () => {
    vi.useFakeTimers()
    const s = createScope('t')
    s.after(10, () => {})
    vi.advanceTimersByTime(10)
    expect(s.held.timers).toBe(0)
    vi.useRealTimers()
  })
})
