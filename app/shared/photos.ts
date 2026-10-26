// The photo library (idea from Immich, AGPL, so nothing of its code): a local folder or your own Immich
// through its API, searched here. Only the date taken and the camera are read from EXIF; location (GPS)
// is never read and faces are never detected.

export type Photo = { id: string; source: 'folder' | 'immich'; name: string; folder: string; taken: string; camera: string; size: number; path?: string }

/** Date taken and camera from a JPEG's EXIF block; GPS tags are skipped on purpose. */
export function exifOf(buf: Uint8Array): { taken?: string; camera?: string } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.byteLength < 4 || dv.getUint16(0) !== 0xffd8) return {}
  let off = 2
  while (off + 4 < dv.byteLength) {
    const marker = dv.getUint16(off)
    const len = dv.getUint16(off + 2)
    if (marker === 0xffe1 && dv.getUint32(off + 4) === 0x45786966) return tiff(dv, off + 10)
    if ((marker & 0xff00) !== 0xff00 || len < 2) break
    off += 2 + len
  }
  return {}
}

function tiff(dv: DataView, t: number): { taken?: string; camera?: string } {
  if (t + 8 > dv.byteLength) return {}
  const le = dv.getUint16(t) === 0x4949
  const u16 = (o: number) => dv.getUint16(o, le)
  const u32 = (o: number) => dv.getUint32(o, le)
  const ascii = (o: number, n: number) => {
    const at = n <= 4 ? o : t + u32(o)
    let s = ''
    for (let i = 0; i < n - 1 && at + i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(at + i))
    return s.replace(/\0+$/, '').trim()
  }
  const out: { taken?: string; camera?: string; make?: string } = {}
  const ifd = (start: number, exif: boolean) => {
    if (start + 2 > dv.byteLength) return
    const n = u16(start)
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12
      if (e + 12 > dv.byteLength) return
      const tag = u16(e)
      const count = u32(e + 4)
      if (tag === 0x010f) out.make = ascii(e + 8, count)
      else if (tag === 0x0110) out.camera = ascii(e + 8, count)
      else if (tag === 0x8769 && !exif) ifd(t + u32(e + 8), true)
      else if (tag === 0x9003) {
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ascii(e + 8, count))
        if (m) out.taken = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
      }
      // 0x8825 (GPS) is deliberately not followed
    }
  }
  ifd(t + u32(t + 4), false)
  const camera = out.camera ? (out.make && !out.camera.startsWith(out.make) ? `${out.make} ${out.camera}` : out.camera) : out.make
  return { ...(out.taken ? { taken: out.taken } : {}), ...(camera ? { camera } : {}) }
}

/** Words in the name and folder, plus "2026", "2026-10" and the camera: what the search box matches. */
export function search(list: Photo[], q: string, from?: string, to?: string): Photo[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return list
    .filter((p) => (!from || p.taken >= from) && (!to || p.taken.slice(0, 10) <= to))
    .filter((p) => {
      const hay = `${p.name} ${p.folder} ${p.camera} ${p.taken.slice(0, 7)}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => b.taken.localeCompare(a.taken))
}
