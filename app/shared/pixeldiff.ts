// What changed between two screenshots of a page: the share of pixels that differ, where, and a picture
// that marks them. Used to compare a screen with its reference (a mock, a design, the version before a
// change) before and after Claude works on it.

export type Pixels = { width: number; height: number; data: Uint8ClampedArray }
export type PixelDiff = { changed: number; total: number; percent: number; box: { x: number; y: number; w: number; h: number } | null; mask: Uint8ClampedArray }

/**
 * Compares the overlapping area pixel by pixel (a channel off by more than `tolerance` counts) and
 * counts the area only one image covers as changed. The mask is the reference, faded, with what
 * changed painted in the accent color.
 */
export function pixelDiff(ref: Pixels, now: Pixels, tolerance = 24, accent: [number, number, number] = [217, 119, 87]): PixelDiff {
  const width = Math.max(ref.width, now.width)
  const height = Math.max(ref.height, now.height)
  const mask = new Uint8ClampedArray(width * height * 4)
  let changed = 0
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const inA = x < ref.width && y < ref.height
      const inB = x < now.width && y < now.height
      let differs = !(inA && inB)
      if (inA && inB) {
        const a = (y * ref.width + x) * 4
        const b = (y * now.width + x) * 4
        differs = Math.abs(ref.data[a]! - now.data[b]!) > tolerance || Math.abs(ref.data[a + 1]! - now.data[b + 1]!) > tolerance || Math.abs(ref.data[a + 2]! - now.data[b + 2]!) > tolerance
      }
      if (differs) {
        changed++
        mask[o] = accent[0]
        mask[o + 1] = accent[1]
        mask[o + 2] = accent[2]
        mask[o + 3] = 255
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      } else {
        // the unchanged page, faded, so the marks stand out where they are
        const a = (y * ref.width + x) * 4
        const grey = (ref.data[a]! * 0.3 + ref.data[a + 1]! * 0.59 + ref.data[a + 2]! * 0.11) | 0
        mask[o] = mask[o + 1] = mask[o + 2] = 128 + (grey >> 1)
        mask[o + 3] = 255
      }
    }
  const total = width * height
  return { changed, total, percent: total ? Math.round((changed / total) * 10000) / 100 : 0, box: x1 >= 0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null, mask }
}
