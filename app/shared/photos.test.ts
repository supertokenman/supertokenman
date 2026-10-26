import { describe, expect, it } from 'vitest'
import { exifOf, search, type Photo } from './photos'

/** A tiny JPEG with an EXIF block: Make, Model, an Exif IFD with DateTimeOriginal, and a GPS pointer. */
function jpeg(le: boolean) {
  const b: number[] = []
  const u16 = (v: number) => (le ? b.push(v & 255, v >> 8) : b.push(v >> 8, v & 255))
  const u32 = (v: number) => (le ? b.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24) : b.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255))
  const str = (s: string) => [...s].forEach((c) => b.push(c.charCodeAt(0)))
  // TIFF header
  str(le ? 'II' : 'MM'); u16(42); u32(8)
  // IFD0 at 8: 4 entries
  u16(4)
  u16(0x010f); u16(2); u32(6); u32(62) // Make -> 62
  u16(0x0110); u16(2); u32(7); u32(68) // Model -> 68
  u16(0x8769); u16(4); u32(1); u32(75) // ExifIFD -> 75
  u16(0x8825); u16(4); u32(1); u32(200) // GPS (ignored)
  u32(0)
  str('Apple\0'); str('iPhone\0')
  // Exif IFD at 75
  u16(1); u16(0x9003); u16(2); u32(20); u32(93); u32(0)
  str('2026:10:24 07:12:33\0')
  const tiffBytes = b
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiffBytes]
  const len = app1.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xd9])
}

describe('photos', () => {
  it('reads date and camera, both byte orders, never GPS', () => {
    expect(exifOf(jpeg(true))).toEqual({ taken: '2026-10-24T07:12:33', camera: 'Apple iPhone' })
    expect(exifOf(jpeg(false))).toEqual({ taken: '2026-10-24T07:12:33', camera: 'Apple iPhone' })
    expect(exifOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual({})
    expect(Object.keys(exifOf(jpeg(true)))).not.toContain('gps')
  })
  it('searches by words and dates', () => {
    const p = (name: string, folder: string, taken: string, camera = ''): Photo => ({ id: name, source: 'folder', name, folder, taken, camera, size: 1 })
    const list = [p('IMG_1.jpg', 'Trips/Lisbon', '2026-05-02T10:00:00'), p('run.jpg', 'Races', '2026-10-24T07:12:33', 'Apple iPhone'), p('x.png', 'Misc', '2025-01-01T00:00:00')]
    expect(search(list, 'lisbon').map((x) => x.name)).toEqual(['IMG_1.jpg'])
    expect(search(list, 'iphone 2026-10').map((x) => x.name)).toEqual(['run.jpg'])
    expect(search(list, '', '2026-01-01').map((x) => x.name)).toEqual(['run.jpg', 'IMG_1.jpg'])
  })
})
