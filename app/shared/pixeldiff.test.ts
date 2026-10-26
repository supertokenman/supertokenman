import { describe, expect, it } from 'vitest'
import { pixelDiff, type Pixels } from './pixeldiff'

const img = (w: number, h: number, fill: [number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set([...fill, 255], i * 4)
  return { width: w, height: h, data }
}
const paint = (p: Pixels, x: number, y: number, c: [number, number, number]) => p.data.set([...c, 255], (y * p.width + x) * 4)

describe('pixel diff', () => {
  it('finds nothing between equal images, and ignores small shifts in color', () => {
    const a = img(10, 10, [200, 200, 200])
    const b = img(10, 10, [210, 195, 205])
    expect(pixelDiff(a, b)).toMatchObject({ changed: 0, percent: 0, box: null })
  })
  it('counts changed pixels and boxes where they are', () => {
    const a = img(10, 10, [255, 255, 255])
    const b = img(10, 10, [255, 255, 255])
    paint(b, 2, 3, [0, 0, 0])
    paint(b, 5, 7, [0, 0, 0])
    const d = pixelDiff(a, b)
    expect(d).toMatchObject({ changed: 2, total: 100, percent: 2, box: { x: 2, y: 3, w: 4, h: 5 } })
    expect([...d.mask.slice((3 * 10 + 2) * 4, (3 * 10 + 2) * 4 + 3)]).toEqual([217, 119, 87])
  })
  it('counts the area only one image covers as changed', () => {
    const d = pixelDiff(img(10, 10, [0, 0, 0]), img(10, 12, [0, 0, 0]))
    expect(d).toMatchObject({ changed: 20, total: 120, box: { x: 0, y: 10, w: 10, h: 2 } })
  })
})
