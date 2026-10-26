import { describe, expect, it } from 'vitest'
import { arrange } from './layout'

describe('arrange', () => {
  it('puts four panels in a 2 by 2 grid by default', () => {
    expect(arrange(4, 'auto')).toEqual({ cols: 2, rows: 2 })
    expect(arrange(3, 'auto')).toEqual({ cols: 3, rows: 1 })
    expect(arrange(6, 'auto')).toEqual({ cols: 3, rows: 2 })
  })
  it('keeps every panel in one row, or the squarest grid, when asked', () => {
    expect(arrange(4, 'columns')).toEqual({ cols: 4, rows: 1 })
    expect(arrange(5, 'grid')).toEqual({ cols: 3, rows: 2 })
    expect(arrange(9, 'grid')).toEqual({ cols: 3, rows: 3 })
  })
  it('stacks in a portrait window', () => expect(arrange(4, 'columns', true)).toEqual({ cols: 2, rows: 2 }))
  it('goes four across on a wide monitor and wraps before panels get too narrow', () => {
    const wide = { w: 3440, h: 1440 }
    expect(arrange(4, 'auto', false, wide)).toEqual({ cols: 4, rows: 1 })
    expect(arrange(6, 'auto', false, wide)).toEqual({ cols: 4, rows: 2 })
    expect(arrange(4, 'auto', false, { w: 1440, h: 900 })).toEqual({ cols: 2, rows: 2 })
    expect(arrange(6, 'columns', false, { w: 1440, h: 900 })).toEqual({ cols: 2, rows: 3 })
  })
  it('stacks three in one column on a monitor on its side', () => {
    expect(arrange(3, 'auto', true, { w: 1080, h: 1920 })).toEqual({ cols: 1, rows: 3 })
    expect(arrange(3, 'auto', true, { w: 1100, h: 1000 })).toEqual({ cols: 2, rows: 2 })
    expect(arrange(5, 'auto', true, { w: 1080, h: 1920 })).toEqual({ cols: 2, rows: 3 })
  })
})
