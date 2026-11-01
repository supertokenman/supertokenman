import { describe, expect, it } from 'vitest'
import { dayRange, planSummary, rowHeight, ROW_H, setAfterPlan, testInput, visibleRange, withBefore } from './controlview'

describe('visibleRange', () => {
  const h = Array(100).fill(ROW_H) as number[]
  it('slices around the scroll position with spacers that add up', () => {
    const r = visibleRange(h, 300, 150, 2)
    expect(r.start).toBe(8)
    expect(r.end).toBe(17)
    expect(r.before + (r.end - r.start) * ROW_H + r.after).toBe(100 * ROW_H)
  })
  it('handles empty and variable heights', () => {
    expect(visibleRange([], 0, 100)).toEqual({ start: 0, end: 0, before: 0, after: 0 })
    const v = visibleRange([30, 200, 30, 30], 100, 50, 0)
    expect(v.start).toBe(1)
  })
})

describe('rowHeight', () => {
  it('grows only for an open receipt with files', () => {
    const files = [{ path: 'a', change: 'M' as const }]
    expect(rowHeight({ kind: 'receipt', files }, true)).toBeGreaterThan(ROW_H)
    expect(rowHeight({ kind: 'receipt', files }, false)).toBe(ROW_H)
    expect(rowHeight({ kind: 'tool' }, true)).toBe(ROW_H)
  })
})

describe('dayRange', () => {
  it('covers one local day', () => {
    const r = dayRange('2026-03-08')
    expect(r.to).toBeGreaterThan(r.from)
    expect(new Date(r.from).getDate()).toBe(8)
    expect(new Date(r.to).getDate()).toBe(8)
  })
})

describe('testInput', () => {
  it('puts the text where the tool keeps it', () => {
    expect(testInput('Bash', 'ls')).toEqual({ command: 'ls' })
    expect(testInput('Write', ' /a/b ')).toEqual({ file_path: '/a/b' })
    expect(testInput('WebFetch', 'https://x.test')).toEqual({ url: 'https://x.test' })
  })
})

describe('planSummary', () => {
  it('counts done and names the item in progress', () => {
    const s = planSummary({ items: [{ text: 'a', status: 'completed' }, { text: 'b', status: 'in_progress', active: 'Doing b' }, { text: 'c', status: 'pending' }] })
    expect(s).toEqual({ done: 1, total: 3, current: 'Doing b' })
    expect(planSummary(null)).toEqual({ done: 0, total: 0 })
  })
})

describe('breakpoint list', () => {
  it('adds a tool once and toggles after plan', () => {
    let l = withBefore([], ' Bash ')
    l = withBefore(l, 'Bash')
    expect(l).toEqual([{ kind: 'before', tool: 'Bash' }])
    l = setAfterPlan(l, true)
    expect(l).toHaveLength(2)
    expect(setAfterPlan(l, false)).toEqual([{ kind: 'before', tool: 'Bash' }])
    expect(withBefore([], '  ')).toEqual([])
  })
})
