import { describe, expect, it, vi } from 'vitest'
import { path, plan } from './splitflap'

describe('split-flap', () => {
  it('rolls digits forward and swaps other glyphs', () => {
    expect(path('7', '1')).toEqual(['8', '9', '0', '1'])
    expect(path('$', 'R')).toEqual(['R'])
    expect(path('4', '4')).toEqual(['4'])
  })
  it('ends on the new value, the rightmost column first', () => {
    const p = plan('R$0.09', 'R$0.12', { stepMs: 40, staggerMs: 80 })
    expect(p.frames.at(-1)).toBe('R$0.12')
    expect(p.frames[0]).toBe('R$0.00')
    // duration: the left changed column waits two steps and rolls one glyph after the right one
    expect(p.totalMs).toBe(p.frames.length * 40)
  })
  it('grows the width when the number gains a digit', () => {
    expect(plan('99', '100').frames.at(-1)).toBe('100')
  })
  it('reduced motion jumps straight to the end', () => {
    expect(plan('1', '9', { reduced: true })).toMatchObject({ frames: ['9'], totalMs: 0 })
  })
  it('plays on a timer for the planned time', () => {
    vi.useFakeTimers()
    const p = plan('0', '5', { stepMs: 40 })
    const seen: string[] = []
    let i = 0
    const t = setInterval(() => (i < p.frames.length ? seen.push(p.frames[i++]!) : clearInterval(t)), p.stepMs)
    vi.advanceTimersByTime(p.totalMs + 40)
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    vi.useRealTimers()
  })
})
