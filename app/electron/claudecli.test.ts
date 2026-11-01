import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClaudeCli, checkEntry, deferredQuery, downloadedCli, extractEntry, installCli, integrityMatches, parseVersion, prune, resolveCli, type CliManifest, type CliState } from './claudecli'

// a minimal ustar archive, as npm packs it
function tar(files: Record<string, Buffer>): Buffer {
  const parts: Buffer[] = []
  for (const [name, body] of Object.entries(files)) {
    const h = Buffer.alloc(512)
    h.write(name, 0)
    h.write('0000755\0', 100)
    h.write('0000000\0', 108)
    h.write('0000000\0', 116)
    h.write(body.length.toString(8).padStart(11, '0') + '\0', 124)
    h.write('00000000000\0', 136)
    h.write('        ', 148)
    h.write('0', 156)
    h.write('ustar\x0000', 257)
    let sum = 0
    for (const b of h) sum += b
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
    parts.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return Buffer.concat([...parts, Buffer.alloc(1024)])
}
const sri = (b: Buffer) => `sha512-${createHash('sha512').update(b).digest('base64')}`
const BIN = Buffer.from('#!/bin/sh\necho "9.9.9 (Claude Code)"\n'.padEnd(70_000, '#'))
const TGZ = gzipSync(tar({ 'package/package.json': Buffer.from('{}'), 'package/claude': BIN, 'package/README.md': Buffer.from('hi') }))

let server: Server
let host = ''
let hits = 0
beforeAll(async () => {
  server = createServer((req, res) => {
    hits++
    if (req.url === '/pkg.tgz') return res.writeHead(200, { 'content-length': TGZ.length }).end(TGZ)
    if (req.url === '/bad.tgz') return res.writeHead(200).end(Buffer.concat([TGZ, Buffer.from('x')]))
    res.writeHead(404).end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const a = server.address()
  host = typeof a === 'object' && a ? `127.0.0.1:${a.port}` : ''
})
afterAll(() => server.close())

const manifest = (path = '/pkg.tgz', integrity = sri(TGZ)): CliManifest => ({ sdk: '0.3.1', cli: '9.9.9', platforms: { 'linux-x64': { name: '@anthropic-ai/claude-agent-sdk-linux-x64', version: '0.3.1', url: `http://${host}${path}`, integrity } } })
const tmp = () => mkdtempSync(join(tmpdir(), 'stm-cli-'))

describe('integrity', () => {
  it('matches a good sha512 and rejects a bad one or another algorithm', () => {
    const d = createHash('sha512').update(TGZ).digest()
    expect(integrityMatches(d, sri(TGZ))).toBe(true)
    expect(integrityMatches(d, sri(Buffer.from('other')))).toBe(false)
    expect(integrityMatches(d, `sha1-${createHash('sha1').update(TGZ).digest('base64')}`)).toBe(false)
  })
  it('refuses a manifest entry off the npm registry', () => {
    const e = { name: '@anthropic-ai/claude-agent-sdk-linux-x64', version: '1.0.0', url: 'https://evil.example/x.tgz', integrity: 'sha512-AA==' }
    expect(() => checkEntry(e, '1.0.0')).toThrow(/evil/)
    expect(() => checkEntry({ ...e, url: 'http://registry.npmjs.org/x.tgz' }, '1.0.0')).toThrow(/Refusing/)
    expect(() => checkEntry({ ...e, url: 'https://registry.npmjs.org/x.tgz', version: '0.9.0' }, '1.0.0')).toThrow(/match/)
    expect(checkEntry({ ...e, url: 'https://registry.npmjs.org/x.tgz' }, '1.0.0').name).toBe(e.name)
  })
  it('reads claude --version', () => {
    expect(parseVersion('2.1.308 (Claude Code)\n')).toBe('2.1.308')
    expect(parseVersion('command not found')).toBeUndefined()
  })
})

describe('resolution order', () => {
  const v = (out: Record<string, string>) => async (p: string) => out[p]
  it('bundled, then downloaded, then an installed claude of the exact version', async () => {
    expect(await resolveCli({ want: '2.1.0', bundled: '/b', downloaded: '/d', installed: '/i', versionOf: v({ '/i': '2.1.0' }) })).toMatchObject({ path: '/b', source: 'bundled' })
    expect(await resolveCli({ want: '2.1.0', downloaded: '/d', installed: '/i', versionOf: v({ '/i': '2.1.0' }) })).toMatchObject({ path: '/d', source: 'downloaded' })
    expect(await resolveCli({ want: '2.1.0', installed: '/i', versionOf: v({ '/i': '2.1.0' }) })).toMatchObject({ path: '/i', source: 'installed' })
  })
  it('skips an installed claude of another version (download instead)', async () => {
    expect(await resolveCli({ want: '2.1.308', installed: '/i', versionOf: v({ '/i': '2.1.316' }) })).toBeUndefined()
    expect(await resolveCli({ want: '2.1.308', installed: '/i', versionOf: async () => { throw new Error('ENOENT') } })).toBeUndefined()
    expect(await resolveCli({ want: '2.1.308', versionOf: v({}) })).toBeUndefined()
  })
})

describe('download (local HTTP server, no real network)', () => {
  it('downloads, verifies, extracts only the binary, marks it executable and resolves it next time', async () => {
    const root = tmp()
    const seen: number[] = []
    const p = await installCli({ root, m: manifest(), key: 'linux-x64', fetch, allowHost: host, platform: 'linux', onProgress: (g) => seen.push(g) })
    expect(p).toBe(join(root, '9.9.9', 'claude'))
    expect(readFileSync(p).equals(BIN)).toBe(true)
    expect(statSync(p).mode & 0o111).toBeTruthy()
    expect(readdirSync(join(root, '9.9.9')).sort()).toEqual(['claude', 'pinned.json'])
    expect(seen.at(-1)).toBe(TGZ.length)
    expect(downloadedCli(root, manifest(), 'linux-x64', 'linux')).toBe(p)
    // a different pin (new release) does not reuse it
    expect(downloadedCli(root, manifest('/pkg.tgz', sri(Buffer.from('new'))), 'linux-x64', 'linux')).toBeUndefined()
    // a truncated binary is not trusted
    writeFileSync(p, 'x')
    expect(downloadedCli(root, manifest(), 'linux-x64', 'linux')).toBeUndefined()
  })
  it('a tarball that does not match its pin installs nothing', async () => {
    const root = tmp()
    await expect(installCli({ root, m: manifest('/bad.tgz'), key: 'linux-x64', fetch, allowHost: host, platform: 'linux' })).rejects.toThrow(/checksum/)
    expect(readdirSync(root)).toEqual([])
  })
  it('never fetches from a host other than the registry', async () => {
    const before = hits
    await expect(installCli({ root: tmp(), m: manifest(), key: 'linux-x64', fetch, platform: 'linux' })).rejects.toThrow(/Refusing/)
    expect(hits).toBe(before)
  })
  it('the app controller: download on first need, a failure with Retry, then ready', async () => {
    const root = tmp()
    const states: CliState[] = []
    let fail = true
    const cli = new ClaudeCli({
      manifest: manifest(), root, key: 'linux-x64', platform: 'linux', allowHost: host,
      bundled: () => undefined, installed: () => '/usr/bin/claude', versionOf: async () => '2.1.316',
      fetch: (url, init) => (fail ? Promise.reject(new Error('offline')) : fetch(url, init)),
      onState: (s) => states.push(s),
    })
    await expect(cli.ensure()).rejects.toThrow(/not set up yet: offline/)
    expect(cli.state).toMatchObject({ phase: 'failed', host })
    expect(cli.path).toBeUndefined()
    fail = false
    await cli.retry()
    expect(cli.state).toMatchObject({ phase: 'ready', source: 'downloaded', version: '9.9.9' })
    expect(states.some((s) => s.phase === 'downloading')).toBe(true)
    // the next launch finds it without the network
    const again = new ClaudeCli({ manifest: manifest(), root, key: 'linux-x64', platform: 'linux', bundled: () => undefined, installed: () => undefined, versionOf: async () => undefined, fetch: () => Promise.reject(new Error('no')), onState: () => undefined })
    expect(await again.ensure()).toBe(join(root, '9.9.9', 'claude'))
  })
  it('an unsupported platform says so instead of starting a broken panel', async () => {
    const cli = new ClaudeCli({ manifest: manifest(), root: tmp(), key: 'aix-ppc64', bundled: () => undefined, installed: () => undefined, versionOf: async () => undefined, fetch, onState: () => undefined })
    await expect(cli.ensure()).rejects.toThrow(/aix-ppc64/)
  })
})

describe('tar', () => {
  it('extracts one entry from a gzipped tarball', async () => {
    const d = tmp()
    writeFileSync(join(d, 'a.tgz'), TGZ)
    expect(await extractEntry(join(d, 'a.tgz'), 'package/claude', join(d, 'out'))).toBe(BIN.length)
    await expect(extractEntry(join(d, 'a.tgz'), 'package/nope', join(d, 'x'))).rejects.toThrow(/no package\/nope/)
  })
})

describe('prune', () => {
  it('keeps the current and the previous version, drops older ones and partial folders', () => {
    const root = tmp()
    const t = Date.now() / 1000
    for (const [v, age] of [['2.1.1', 300], ['2.1.2', 200], ['2.1.3', 100], ['2.1.4', 0]] as const) {
      mkdirSync(join(root, v))
      utimesSync(join(root, v), t - age, t - age)
    }
    mkdirSync(join(root, '.2.1.5-1-2'))
    expect(prune(root, '2.1.4').sort()).toEqual(['.2.1.5-1-2', '2.1.1', '2.1.2'])
    expect(readdirSync(root).sort()).toEqual(['2.1.3', '2.1.4'])
    expect(existsSync(join(root, '2.1.4'))).toBe(true)
  })
})

describe('deferredQuery', () => {
  const fake = (msgs: number[]) => {
    const g = (async function* () { yield* msgs })()
    return Object.assign(g, { interrupt: async () => 'stopped' })
  }
  it('reads the real query once it is ready, and forwards its methods', async () => {
    let ready!: (q: ReturnType<typeof fake>) => void
    const q = deferredQuery(new Promise<ReturnType<typeof fake>>((r) => (ready = r)))
    const got: number[] = []
    const reading = (async () => { for await (const m of q) got.push(m as number) })()
    const stopped = q.interrupt()
    expect(got).toEqual([])
    ready(fake([1, 2]))
    await reading
    expect(got).toEqual([1, 2])
    expect(await stopped).toBe('stopped')
  })
  it('ends the iteration with the setup error', async () => {
    const q = deferredQuery<ReturnType<typeof fake>>(Promise.reject(new Error('Claude Code is not set up yet: offline')))
    await expect((async () => { for await (const _ of q) void _ })()).rejects.toThrow('offline')
  })
})
