import { describe, expect, it } from 'vitest'
import { clampBounds, parseState } from './winstate'

const laptop = { x: 0, y: 0, width: 1512, height: 944 }
const external = { x: 1512, y: 0, width: 2560, height: 1440 }

describe('window state', () => {
  it('keeps a window that is on a screen', () => {
    expect(clampBounds({ x: 1700, y: 100, width: 1400, height: 900 }, [laptop, external])).toEqual({ x: 1700, y: 100, width: 1400, height: 900 })
  })
  it('moves a window whose monitor is gone onto the primary screen, shrunk to fit', () => {
    expect(clampBounds({ x: 1700, y: 100, width: 2000, height: 1200 }, [laptop])).toEqual({ x: 0, y: 0, width: 1512, height: 944 })
    expect(clampBounds({ x: 1700, y: 100, width: 1000, height: 700 }, [laptop])).toEqual({ x: 256, y: 122, width: 1000, height: 700 })
  })
  it('keeps the minimum size and reads saved state safely', () => {
    expect(clampBounds({ x: 10, y: 10, width: 100, height: 100 }, [laptop])).toMatchObject({ width: 760, height: 520 })
    expect(parseState('{"x":1,"y":2,"width":3,"height":4,"maximized":true}')).toMatchObject({ maximized: true })
    expect(parseState('nope')).toBeNull()
    expect(parseState('{"x":"a"}')).toBeNull()
  })
})
