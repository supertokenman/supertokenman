// The Claude Code CLI the panels run. The app no longer ships it (279 MB, half the package): on first need
// it downloads the exact platform package the Agent SDK depends on, pinned in package-lock.json and copied
// into dist-electron/cli-manifest.json at build time (scripts/cli-manifest.mjs). The tarball's sha512 is
// checked against that pin before anything is extracted, and only the binary is kept, in userData.
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { createGunzip } from 'node:zlib'
import { once } from 'node:events'

export type CliEntry = { name: string; version: string; url: string; integrity: string }
/** sdk: the Agent SDK version; cli: the Claude Code version it expects (`claude --version`). */
export type CliManifest = { sdk: string; cli: string; platforms: Record<string, CliEntry> }
export type CliSource = 'bundled' | 'downloaded' | 'installed'
export type Resolved = { path: string; source: CliSource; version: string }
export type CliState =
  | { phase: 'idle' }
  | { phase: 'ready'; path: string; source: CliSource; version: string }
  | { phase: 'downloading'; host: string; version: string; got: number; total?: number }
  | { phase: 'failed'; host: string; version: string; message: string }
  | { phase: 'unsupported'; message: string }

/** The only place a CLI is ever fetched from. */
export const REGISTRY_HOST = 'registry.npmjs.org'
const MARK = 'pinned.json'

export const platformKey = (platform = process.platform, arch = process.arch) => `${platform}-${arch}`
export const binName = (platform: string = process.platform) => (platform === 'win32' ? 'claude.exe' : 'claude')

/** `claude --version` prints "2.1.308 (Claude Code)"; the bare version, or undefined. */
export function parseVersion(out: string): string | undefined {
  return /^\s*(\d+\.\d+\.\d+(?:-[\w.]+)?)\b/.exec(out)?.[1]
}

/** Whether a sha512 digest (raw bytes) matches an npm `integrity` string. Only sha512 is accepted. */
export function integrityMatches(digest: Buffer, integrity: string): boolean {
  const want = integrity.split(/\s+/).filter((s) => s.startsWith('sha512-')).map((s) => s.slice(7))
  return want.length > 0 && want.some((b64) => Buffer.from(b64, 'base64').equals(digest))
}

/** Checks a manifest entry before it is used: pinned registry URL, sha512, matching package version. */
export function checkEntry(e: CliEntry | undefined, sdk: string, allowHost = REGISTRY_HOST): CliEntry {
  if (!e) throw new Error('This platform has no pinned Claude Code build.')
  const u = new URL(e.url)
  const local = allowHost !== REGISTRY_HOST && u.protocol === 'http:'
  if ((u.protocol !== 'https:' && !local) || u.host !== allowHost) throw new Error(`Refusing to download Claude Code from ${u.host}.`)
  if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(e.integrity)) throw new Error('The pinned Claude Code build has no sha512 integrity.')
  if (e.version !== sdk || !/^@anthropic-ai\/claude-agent-sdk-[a-z0-9-]+$/.test(e.name)) throw new Error('The pinned Claude Code build does not match the Agent SDK.')
  return e
}

/** The binary downloaded earlier for this exact pin, if it is still there and whole. */
export function downloadedCli(root: string, m: CliManifest, key: string, platform: string = process.platform): string | undefined {
  const e = m.platforms[key]
  if (!e) return undefined
  const dir = join(root, m.cli)
  const p = join(dir, binName(platform))
  try {
    const mark = JSON.parse(readFileSync(join(dir, MARK), 'utf8')) as { integrity?: string; size?: number; name?: string }
    return mark.integrity === e.integrity && mark.name === e.name && statSync(p).size === mark.size ? p : undefined
  } catch {
    return undefined
  }
}

/**
 * Which CLI to run, in order: one bundled in the app (a build made with STM_BUNDLE_CLI=1), the pinned
 * download, then an installed `claude` only when its version is exactly the pinned one. Undefined means
 * download it.
 */
export async function resolveCli(o: { want: string; bundled?: string; downloaded?: string; installed?: string; versionOf: (path: string) => Promise<string | undefined> }): Promise<Resolved | undefined> {
  if (o.bundled) return { path: o.bundled, source: 'bundled', version: o.want }
  if (o.downloaded) return { path: o.downloaded, source: 'downloaded', version: o.want }
  if (o.installed && (await o.versionOf(o.installed).catch(() => undefined)) === o.want) return { path: o.installed, source: 'installed', version: o.want }
  return undefined
}

/** Keeps the current version and the most recent other one; removes the rest and leftover partial folders. */
export function prune(root: string, current: string): string[] {
  if (!existsSync(root)) return []
  const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
  const gone: string[] = []
  const others = dirs.filter((d) => d.name !== current && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, t: statSync(join(root, d.name)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const d of [...others.slice(1).map((o) => o.name), ...dirs.filter((d) => d.name.startsWith('.')).map((d) => d.name)]) {
    rmSync(join(root, d), { recursive: true, force: true })
    gone.push(d)
  }
  return gone
}

/** Streams one file out of a .tgz into `out`. Handles ustar, GNU long names and pax path headers. */
export async function extractEntry(tgz: string, entry: string, out: string): Promise<number> {
  const src = createReadStream(tgz).pipe(createGunzip())
  let buf: Buffer = Buffer.alloc(0)
  const it = src[Symbol.asyncIterator]()
  const need = async (n: number) => {
    while (buf.length < n) {
      const r = await it.next()
      if (r.done) return false
      buf = buf.length ? Buffer.concat([buf, r.value as Buffer]) : (r.value as Buffer)
    }
    return true
  }
  const str = (b: Buffer) => b.toString('utf8').replace(/\0.*$/s, '')
  const octal = (b: Buffer) => (b[0] & 0x80 ? Number(b.subarray(1).readBigUInt64BE(b.length - 9)) : parseInt(str(b).trim() || '0', 8))
  let longName: string | undefined
  try {
    for (;;) {
      if (!(await need(512))) break
      const h = buf.subarray(0, 512)
      buf = buf.subarray(512)
      if (h.every((x) => x === 0)) break
      const size = octal(h.subarray(124, 136))
      const type = String.fromCharCode(h[156] || 48)
      const prefix = str(h.subarray(345, 500))
      const name = longName ?? (prefix ? `${prefix}/${str(h.subarray(0, 100))}` : str(h.subarray(0, 100)))
      longName = undefined
      const padded = Math.ceil(size / 512) * 512
      if (type === 'L' || type === 'x') {
        if (!(await need(padded))) break
        const body = buf.subarray(0, size).toString('utf8')
        buf = buf.subarray(padded)
        longName = type === 'L' ? body.replace(/\0.*$/s, '') : /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body)?.[1]
        continue
      }
      const hit = (type === '0' || type === '\0') && name === entry
      const w = hit ? createWriteStream(out, { mode: 0o755 }) : null
      let left = padded
      let data = size
      while (left > 0) {
        if (!buf.length && !(await need(1))) throw new Error('The Claude Code download is cut short.')
        const take = Math.min(left, buf.length)
        const chunk = buf.subarray(0, take)
        buf = buf.subarray(take)
        left -= take
        if (w && data > 0) {
          const part = chunk.subarray(0, Math.min(data, chunk.length))
          data -= part.length
          if (!w.write(part)) await once(w, 'drain')
        }
      }
      if (w) {
        w.end()
        await once(w, 'finish')
        return size
      }
    }
  } finally {
    src.destroy()
  }
  throw new Error(`The Claude Code package has no ${entry}.`)
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(k: string): string | null }; body: ReadableStream<Uint8Array> | null }>

/**
 * Downloads the pinned tarball, checks its sha512 before extracting, keeps only the binary and switches
 * to it with one rename, so a half-written binary is never run. Returns the binary's path.
 */
export async function installCli(o: { root: string; m: CliManifest; key: string; fetch: FetchLike; signal?: AbortSignal; onProgress?: (got: number, total?: number) => void; allowHost?: string; platform?: string }): Promise<string> {
  const e = checkEntry(o.m.platforms[o.key], o.m.sdk, o.allowHost)
  mkdirSync(o.root, { recursive: true })
  const tmp = join(o.root, `.${o.m.cli}-${process.pid}-${Date.now()}`)
  mkdirSync(tmp)
  try {
    const res = await o.fetch(e.url, { signal: o.signal })
    if (!res.ok || !res.body) throw new Error(`${REGISTRY_HOST} answered ${res.status}.`)
    const total = Number(res.headers.get('content-length')) || undefined
    const tgz = join(tmp, 'package.tgz')
    const hash = createHash('sha512')
    const w = createWriteStream(tgz)
    let got = 0
    const reader = res.body.getReader()
    for (;;) {
      const r = await reader.read()
      if (r.done) break
      hash.update(r.value)
      got += r.value.length
      o.onProgress?.(got, total)
      if (!w.write(r.value)) await once(w, 'drain')
    }
    w.end()
    await once(w, 'finish')
    // nothing from the tarball is read before this check
    if (!integrityMatches(hash.digest(), e.integrity)) throw new Error('The Claude Code download does not match its pinned checksum; nothing was installed.')
    const name = binName(o.platform)
    const bin = join(tmp, name)
    const size = await extractEntry(tgz, `package/${name}`, bin)
    rmSync(tgz)
    chmodSync(bin, 0o755)
    writeFileSync(join(tmp, MARK), JSON.stringify({ name: e.name, version: e.version, cli: o.m.cli, integrity: e.integrity, size }))
    const dest = join(o.root, o.m.cli)
    rmSync(dest, { recursive: true, force: true })
    renameSync(tmp, dest)
    prune(o.root, o.m.cli)
    return join(dest, name)
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true })
    throw err
  }
}

/** The app's side: resolves once, downloads on first need, and reports each step to the window. */
export class ClaudeCli {
  state: CliState = { phase: 'idle' }
  private job: Promise<string> | null = null
  private abort: AbortController | null = null
  constructor(private d: {
    manifest: CliManifest | null; root: string; key: string
    bundled: () => string | undefined; installed: () => string | undefined
    versionOf: (p: string) => Promise<string | undefined>; fetch: FetchLike; onState: (s: CliState) => void
    allowHost?: string; platform?: string
  }) {}

  /** The path to run now, without waiting; undefined until ensure() has resolved one. */
  get path(): string | undefined { return this.state.phase === 'ready' ? this.state.path : undefined }

  private set(s: CliState) { this.state = s; this.d.onState(s) }

  /** Resolves a CLI, downloading the pinned one if needed. Rejects with a message fit for a panel. */
  ensure(): Promise<string> {
    if (this.state.phase === 'ready') return Promise.resolve(this.state.path)
    if (this.job) return this.job
    this.job = this.run().finally(() => { this.job = null })
    return this.job
  }

  /** Resolves without downloading (for Settings and launch). */
  async peek(): Promise<CliState> {
    if (this.state.phase !== 'idle') return this.state
    const m = this.d.manifest
    if (!m) return this.state
    const r = await resolveCli({ want: m.cli, bundled: this.d.bundled(), downloaded: downloadedCli(this.d.root, m, this.d.key, this.d.platform), installed: this.d.installed(), versionOf: this.d.versionOf })
    if (r && this.state.phase === 'idle') this.set({ phase: 'ready', ...r })
    return this.state
  }

  cancel() { this.abort?.abort() }

  private async run(): Promise<string> {
    const m = this.d.manifest
    if (!m || !m.platforms[this.d.key]) {
      const message = `No pinned Claude Code build for ${this.d.key}.`
      this.set({ phase: 'unsupported', message })
      throw new Error(message)
    }
    const r = await this.peek()
    if (r.phase === 'ready') return r.path
    const host = this.d.allowHost ?? REGISTRY_HOST
    this.abort = new AbortController()
    this.set({ phase: 'downloading', host, version: m.cli, got: 0 })
    let last = 0
    try {
      const path = await installCli({ root: this.d.root, m, key: this.d.key, fetch: this.d.fetch, signal: this.abort.signal, allowHost: this.d.allowHost, platform: this.d.platform, onProgress: (got, total) => {
        if (got - last < 1 << 20 && got !== total) return
        last = got
        this.set({ phase: 'downloading', host, version: m.cli, got, total })
      } })
      this.set({ phase: 'ready', path, source: 'downloaded', version: m.cli })
      return path
    } catch (err) {
      const message = this.abort.signal.aborted ? 'Cancelled.' : err instanceof Error ? err.message : String(err)
      this.set({ phase: 'failed', host, version: m.cli, message })
      throw new Error(`Claude Code is not set up yet: ${message} Use Retry in the setup sheet.`)
    } finally {
      this.abort = null
    }
  }

  /** After a failure: back to idle, then try again. */
  retry(): Promise<string> {
    if (this.state.phase === 'failed') this.state = { phase: 'idle' }
    return this.ensure()
  }
}

/**
 * A query whose Claude Code is still being set up: iterating it waits for the real one and then reads
 * it; any other call (interrupt, setModel, accountInfo...) waits for it too. A failed setup ends the
 * iteration with the setup's message, which the panel shows.
 */
export function deferredQuery<Q extends AsyncIterable<unknown>>(real: Promise<Q>): Q {
  let it: AsyncIterator<unknown> | undefined
  const inner = async () => (it ??= (await real)[Symbol.asyncIterator]())
  const gen = {
    next: async (...a: [] | [unknown]) => (await inner()).next(...a),
    return: async (v?: unknown) => {
      const i = await inner().catch(() => undefined)
      return i?.return ? i.return(v) : { done: true as const, value: v }
    },
    throw: async (e?: unknown) => {
      const i = await inner()
      if (i.throw) return i.throw(e)
      throw e
    },
    [Symbol.asyncIterator]() { return this },
  }
  return new Proxy(gen, {
    get(t, k) {
      if (k in t) return t[k as keyof typeof t]
      if (k === 'then') return undefined
      return (...args: unknown[]) => real.then((q) => (q as unknown as Record<PropertyKey, (...x: unknown[]) => unknown>)[k as string](...args))
    },
  }) as unknown as Q
}
