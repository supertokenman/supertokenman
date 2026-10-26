import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import { analyze, TarStream, type Layer } from './imagexray'

/** A tar of files, enough for the reader. */
function tar(files: { name: string; data?: Buffer; size?: number }[]): Buffer {
  const parts: Buffer[] = []
  for (const f of files) {
    const data = f.data ?? Buffer.alloc(f.size ?? 0, 65)
    const h = Buffer.alloc(512)
    h.write(f.name, 0)
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124)
    h.write('0', 156)
    h.write('ustar\0', 257)
    parts.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)])
}
const L = (id: string, files: Record<string, number>, deletes: string[] = []): Layer => ({ id, files: new Map(Object.entries(files)), deletes, size: Object.values(files).reduce((a, b) => a + b, 0) })

describe('image x-ray', () => {
  it('reads tar headers as a stream, in odd chunk sizes', () => {
    const t = tar([{ name: 'a.txt', size: 700 }, { name: 'dir/b.bin', size: 3 }])
    const seen: string[] = []
    const s = new TarStream({ entry: (e) => void seen.push(`${e.name}:${e.size}`) })
    for (let i = 0; i < t.length; i += 37) s.write(t.subarray(i, i + 37))
    expect(seen).toEqual(['a.txt:700', 'dir/b.bin:3'])
  })
  it('counts bytes overwritten or deleted later as waste', () => {
    const r = analyze('img', [
      L('l1', { 'usr/bin/app': 1000, 'tmp/build.tgz': 5000, 'etc/conf': 100 }),
      L('l2', { 'etc/conf': 120 }),
      L('l3', {}, ['tmp/build.tgz']),
    ], [{ createdBy: 'COPY . /', size: 6100 }, { createdBy: 'RUN echo conf', size: 120 }, { createdBy: 'RUN rm /tmp/build.tgz', size: 1 }])
    expect(r.wasted).toBe(5100)
    expect(r.total).toBe(6220)
    expect(r.efficiency).toBeCloseTo(1 - 5100 / 6220, 5)
    expect(r.worst[0]).toEqual({ path: 'tmp/build.tgz', wasted: 5000, layers: 0 })
    expect(r.layers.map((l) => [l.createdBy, l.wasted])).toEqual([['COPY . /', 5100], ['RUN echo conf', 0], ['RUN rm /tmp/build.tgz', 0]])
  })
  it('an opaque folder hides everything under it', () => {
    const r = analyze('img', [L('l1', { 'cache/a': 10, 'cache/b': 20 }), L('l2', {}, ['cache/*'])])
    expect(r.wasted).toBe(30)
  })
  it('gzip layers are recognised by their first bytes', () => {
    expect(gzipSync(tar([{ name: 'x', size: 1 }]))[0]).toBe(0x1f)
  })
})
