// Phase 115: an X-ray of a Docker image, after dive's idea (own code). `docker save` is read as a
// stream: each layer's files are listed from their tar headers without unpacking anything to disk,
// then the waste is counted: bytes in a layer that a later layer overwrites or deletes.
import { spawn } from 'node:child_process'
import { createGunzip } from 'node:zlib'
import { Writable } from 'node:stream'

export type Entry = { name: string; size: number; type: string }

/** A streaming tar reader: headers come out as they pass; bodies go to `body` or are skipped. */
export class TarStream {
  private buf: Buffer = Buffer.alloc(0)
  private left = 0
  private pad = 0
  private cur: Entry | null = null
  private longName: string | null = null
  constructor(private on: { entry: (e: Entry) => ((chunk: Buffer) => void) | void; end?: (e: Entry) => void }) {}
  private sink: ((chunk: Buffer) => void) | void = undefined
  write(chunk: Buffer) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    for (;;) {
      if (this.left > 0) {
        const n = Math.min(this.left, this.buf.length)
        if (!n) return
        if (this.sink) this.sink(this.buf.subarray(0, n))
        if (this.longName !== null && this.cur?.type === 'L') this.longName += this.buf.subarray(0, n).toString('utf8')
        this.buf = this.buf.subarray(n)
        this.left -= n
        if (this.left === 0) this.finish()
        continue
      }
      if (this.pad > 0) {
        const n = Math.min(this.pad, this.buf.length)
        this.buf = this.buf.subarray(n)
        this.pad -= n
        if (this.pad > 0) return
        continue
      }
      if (this.buf.length < 512) return
      const h = this.buf.subarray(0, 512)
      this.buf = this.buf.subarray(512)
      if (h.every((b) => b === 0)) continue
      const str = (o: number, l: number) => h.subarray(o, o + l).toString('utf8').replace(/\0.*$/s, '')
      const size = parseInt(str(124, 12).trim() || '0', 8) || 0
      const type = str(156, 1) || '0'
      const prefix = str(345, 155)
      let name = (prefix ? `${prefix}/` : '') + str(0, 100)
      if (this.longName !== null && type !== 'L') { name = this.longName.replace(/\0+$/, ''); this.longName = null }
      this.cur = { name, size, type }
      if (type === 'L') { this.longName = ''; this.sink = undefined }
      else this.sink = this.on.entry(this.cur)
      this.left = size
      this.pad = (512 - (size % 512)) % 512
      if (size === 0) this.finish()
    }
  }
  private finish() {
    if (this.cur && this.cur.type !== 'L') this.on.end?.(this.cur)
    this.sink = undefined
  }
}

export type Layer = { id: string; files: Map<string, number>; deletes: string[]; size: number }

/** Files of one layer's tar, from a stream of its bytes (gzip or plain). */
function layerReader(id: string, done: (l: Layer) => void) {
  const l: Layer = { id, files: new Map(), deletes: [], size: 0 }
  const inner = new TarStream({
    entry: (e) => {
      const p = e.name.replace(/^\.\//, '').replace(/\/$/, '')
      const base = p.split('/').pop() ?? ''
      if (base.startsWith('.wh.')) l.deletes.push(base === '.wh..wh..opq' ? `${p.slice(0, -base.length)}*` : p.slice(0, -base.length) + base.slice(4))
      else if (e.type === '0' || e.type === '\0' || e.type === '7') (l.files.set(p, e.size), (l.size += e.size))
    },
  })
  let gz: ReturnType<typeof createGunzip> | null = null
  let started = false
  return {
    write(chunk: Buffer) {
      if (!started) {
        started = true
        if (chunk[0] === 0x1f && chunk[1] === 0x8b) {
          gz = createGunzip()
          gz.on('data', (c: Buffer) => inner.write(c))
          gz.on('end', () => done(l))
          gz.on('error', () => done(l))
        }
      }
      if (gz) gz.write(chunk)
      else inner.write(chunk)
    },
    end() {
      if (gz) gz.end()
      else done(l)
    },
  }
}

export type History = { createdBy: string; size: number }
export type Report = { image: string; total: number; wasted: number; efficiency: number; layers: { id: string; size: number; files: number; createdBy: string; wasted: number }[]; worst: { path: string; wasted: number; layers: number }[] }

/** Waste across layers: a file overwritten or deleted later wasted its earlier bytes. */
export function analyze(image: string, layers: Layer[], history: History[] = []): Report {
  const seen = new Map<string, { size: number; layer: number }[]>()
  const wastedBy = new Map<string, number>()
  const layerWaste = layers.map(() => 0)
  layers.forEach((l, i) => {
    for (const d of l.deletes) {
      const match = d.endsWith('*') ? [...seen.keys()].filter((k) => k.startsWith(d.slice(0, -1))) : seen.has(d) ? [d] : [...seen.keys()].filter((k) => k.startsWith(`${d}/`))
      for (const k of match) for (const v of seen.get(k)!) ((layerWaste[v.layer]! += v.size), wastedBy.set(k, (wastedBy.get(k) ?? 0) + v.size))
      for (const k of match) seen.delete(k)
    }
    for (const [p, size] of l.files) {
      const prev = seen.get(p)
      if (prev) for (const v of prev) ((layerWaste[v.layer]! += v.size), wastedBy.set(p, (wastedBy.get(p) ?? 0) + v.size))
      seen.set(p, [{ size, layer: i }])
    }
  })
  const total = layers.reduce((a, l) => a + l.size, 0)
  const wasted = layerWaste.reduce((a, b) => a + b, 0)
  // history lists every Dockerfile line; layers exist only for the ones that wrote files
  const made = history.filter((h) => h.size > 0)
  return {
    image,
    total,
    wasted,
    efficiency: total ? 1 - wasted / total : 1,
    layers: layers.map((l, i) => ({ id: l.id, size: l.size, files: l.files.size, createdBy: made[i]?.createdBy ?? '', wasted: layerWaste[i]! })),
    worst: [...wastedBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([path, w]) => ({ path, wasted: w, layers: 0 })),
  }
}

const run = (args: string[]) => new Promise<string>((done, fail) => {
  const p = spawn('docker', args)
  let out = ''
  let err = ''
  p.stdout.on('data', (b) => (out += b))
  p.stderr.on('data', (b) => (err += b))
  p.on('close', (c) => (c === 0 ? done(out) : fail(new Error(err.trim() || `docker ${args[0]} failed`))))
  p.on('error', fail)
})

/** The image's layers in order, read from `docker save` as a stream. */
export async function xray(image: string): Promise<Report> {
  if (!/^[\w./:@-]{1,200}$/.test(image)) throw new Error('That is not an image name.')
  const hist = (await run(['image', 'history', '--no-trunc', '--human=false', '--format', '{{json .}}', image])).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { CreatedBy: string; Size: string })
  const history = hist.reverse().map((h) => ({ createdBy: h.CreatedBy.replace(/^\/bin\/sh -c (#\(nop\) )?/, '').trim(), size: Number(h.Size) || 0 }))
  const byPath = new Map<string, Layer>()
  let manifest: { Layers?: string[] }[] = []
  const pending: Promise<void>[] = []
  const readers = new Map<string, ReturnType<typeof layerReader>>()
  await new Promise<void>((done, fail) => {
    const p = spawn('docker', ['save', image])
    const outer = new TarStream({
      entry: (e) => {
        if (e.name === 'manifest.json') {
          let m = ''
          return (c: Buffer) => { m += c.toString('utf8'); try { manifest = JSON.parse(m) } catch { /* still coming */ } }
        }
        if (!/(layer\.tar|blobs\/sha256\/[0-9a-f]{64})$/.test(e.name)) return
        let resolve!: () => void
        pending.push(new Promise((r) => (resolve = r)))
        const r = layerReader(e.name, (l) => (byPath.set(e.name, l), resolve()))
        readers.set(e.name, r)
        return (c: Buffer) => r.write(c)
      },
      // the reader of a layer ends with its entry, even an empty one
      end: (e) => {
        readers.get(e.name)?.end()
        readers.delete(e.name)
      },
    })
    p.stdout.pipe(new Writable({ write: (c: Buffer, _e, cb) => (outer.write(c), cb()) }))
    p.on('close', (c) => (c === 0 ? done() : fail(new Error(`docker save ${image} failed`))))
    p.on('error', fail)
  })
  await Promise.all(pending)
  const order = manifest[0]?.Layers ?? [...byPath.keys()]
  return analyze(image, order.map((k) => byPath.get(k)).filter((l): l is Layer => Boolean(l)), history)
}
