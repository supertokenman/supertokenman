// Phase 118: live connections for the API client (idea from Hoppscotch, our own code): WebSocket,
// Server-Sent Events and Socket.IO, held here in the main process so the window's CSP is not in the
// way and {{NAME}} secrets are filled from the vault without the window seeing them. Anything the
// server sends back is masked against the vault before it is shown.
import { createParser } from 'eventsource-parser'
import type { Socket } from 'socket.io-client'
import { fill, mask } from './apiclient.js'

export type Kind = 'ws' | 'sse' | 'sio'
export type LiveReq = { kind: Kind; url: string; headers: { key: string; value: string; on: boolean }[] }
export type Entry = { at: number; dir: 'in' | 'out' | 'sys'; text: string; size: number; event?: string }
export type Saved = LiveReq & { id: string; name: string; at: number; event: string; log: Entry[] }
/** A saved session: bounded, typed, and with the log trimmed to its last 200 entries. */
export function cleanSaved(x: Saved): Saved {
  const kind = (['ws', 'sse', 'sio'] as const).find((k) => k === x?.kind) ?? 'ws'
  return {
    id: String(x?.id ?? `l${Date.now().toString(36)}`).slice(0, 40),
    name: String(x?.name ?? '').slice(0, 120) || `${kind.toUpperCase()} ${String(x?.url ?? '').replace(/^\w+:\/\//, '').slice(0, 40)}`,
    at: Number(x?.at) || Date.now(),
    kind,
    url: String(x?.url ?? '').slice(0, 4000),
    event: String(x?.event ?? '').slice(0, 200),
    headers: (Array.isArray(x?.headers) ? x.headers : []).slice(0, 50).map((h) => ({ key: String(h.key ?? '').slice(0, 200), value: String(h.value ?? '').slice(0, 4000), on: h.on !== false })),
    log: (Array.isArray(x?.log) ? x.log : []).slice(-200).map((e) => ({ at: Number(e.at) || 0, dir: e.dir === 'in' || e.dir === 'out' ? e.dir : 'sys', text: String(e.text ?? '').slice(0, 8000), size: Number(e.size) || 0, ...(e.event ? { event: String(e.event).slice(0, 200) } : {}) })),
  }
}
type Vault = { get: (n: string) => string | undefined; all: () => { value: string }[] }

const SCHEMES: Record<Kind, RegExp> = { ws: /^wss?:\/\//i, sse: /^https?:\/\//i, sio: /^https?:\/\//i }
const MAX_TEXT = 64_000

/** Fills the address and headers; refuses a scheme that does not fit the kind, or a missing secret. */
export function prepare(r: LiveReq, vault: Vault): { url: string; headers: Record<string, string> } | { error: string } {
  const used = new Set<string>()
  const missing = new Set<string>()
  const url = fill(String(r.url).trim(), vault.get, used, missing)
  const headers: Record<string, string> = {}
  for (const h of r.headers ?? []) if (h.on && h.key.trim()) headers[h.key.trim()] = fill(h.value, vault.get, used, missing)
  if (missing.size) return { error: `Not in the vault: ${[...missing].join(', ')}.` }
  if (!SCHEMES[r.kind]?.test(url)) return { error: r.kind === 'ws' ? 'A WebSocket address starts with ws:// or wss://' : 'The address has to start with http:// or https://' }
  return { url, headers }
}

const cut = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n… (cut at 64 KB)` : s)
const show = (v: unknown) => (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v) } catch { return String(v) } })())

/** One open connection per id; each entry goes out through `emit`, masked. */
export class Live {
  private open = new Map<string, { close: () => void; send: (text: string, event?: string) => void }>()
  constructor(private vault: Vault, private emit: (id: string, e: Entry | { closed: true }) => void) {}

  private entry(id: string, dir: Entry['dir'], raw: string, event?: string) {
    const text = mask(cut(raw), this.vault.all().map((x) => x.value))
    this.emit(id, { at: Date.now(), dir, text, size: Buffer.byteLength(raw), ...(event ? { event } : {}) })
  }
  private ended(id: string, why: string) {
    if (!this.open.delete(id)) return
    this.entry(id, 'sys', why)
    this.emit(id, { closed: true })
  }

  connect(id: string, r: LiveReq): { ok: true } | { error: string } {
    this.close(id)
    const p = prepare(r, this.vault)
    if ('error' in p) return p
    if (r.kind === 'ws') this.ws(id, p.url, p.headers)
    else if (r.kind === 'sse') this.sse(id, p.url, p.headers)
    else void this.sio(id, p.url, p.headers)
    return { ok: true }
  }

  private ws(id: string, url: string, headers: Record<string, string>) {
    // Node's WebSocket (undici) takes headers as an extension of the standard options
    const ws = new WebSocket(url, { headers } as unknown as string[])
    this.open.set(id, { close: () => ws.close(1000), send: (t) => (ws.send(t), this.entry(id, 'out', t)) })
    ws.onopen = () => this.entry(id, 'sys', 'Connected.')
    ws.onmessage = (m) => this.entry(id, 'in', typeof m.data === 'string' ? m.data : `(${(m.data as ArrayBuffer).byteLength ?? 0} bytes, binary)`)
    ws.onerror = () => this.entry(id, 'sys', 'Connection error.')
    ws.onclose = (c) => this.ended(id, `Closed${c.code ? ` (${c.code}${c.reason ? ` ${c.reason}` : ''})` : ''}.`)
  }

  private sse(id: string, url: string, headers: Record<string, string>) {
    const ac = new AbortController()
    this.open.set(id, { close: () => ac.abort(), send: () => this.entry(id, 'sys', 'Server-Sent Events only go one way; nothing was sent.') })
    void (async () => {
      try {
        const r = await fetch(url, { headers: { Accept: 'text/event-stream', ...headers }, signal: ac.signal })
        if (!r.ok || !r.body) return this.ended(id, `The server answered ${r.status} ${r.statusText}.`)
        this.entry(id, 'sys', `Connected (${r.status}${r.headers.get('content-type')?.includes('event-stream') ? '' : `, but the type is ${r.headers.get('content-type') ?? 'missing'}`}).`)
        const parser = createParser({ onEvent: (e) => this.entry(id, 'in', e.data, e.event || 'message') })
        const dec = new TextDecoder()
        for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) parser.feed(dec.decode(chunk, { stream: true }))
        this.ended(id, 'The server ended the stream.')
      } catch (e) {
        this.ended(id, ac.signal.aborted ? 'Closed.' : `Failed: ${(e as Error).message}`)
      }
    })()
  }

  private async sio(id: string, url: string, headers: Record<string, string>) {
    // loaded on the first Socket.IO connection, not at start-up
    const { io } = await import('socket.io-client')
    const s: Socket = io(url, { extraHeaders: headers, reconnection: false, timeout: 10_000, transports: ['websocket', 'polling'] })
    this.open.set(id, { close: () => s.disconnect(), send: (t, event) => {
      let arg: unknown = t
      try { arg = JSON.parse(t) } catch { /* plain text */ }
      s.emit(event || 'message', arg)
      this.entry(id, 'out', t, event || 'message')
    } })
    s.on('connect', () => this.entry(id, 'sys', `Connected (id ${s.id}).`))
    s.on('connect_error', (e) => (this.entry(id, 'sys', `Could not connect: ${e.message}`), s.disconnect(), this.ended(id, 'Closed.')))
    s.on('disconnect', (why) => this.ended(id, `Disconnected (${why}).`))
    s.onAny((event: string, ...args: unknown[]) => this.entry(id, 'in', args.map(show).join(' '), event))
  }

  send(id: string, text: string, event?: string) {
    const c = this.open.get(id)
    if (!c) return false
    c.send(String(text).slice(0, 1_000_000), event ? String(event).slice(0, 200) : undefined)
    return true
  }
  close(id: string) {
    const c = this.open.get(id)
    if (c) c.close()
  }
  closeAll() {
    for (const id of [...this.open.keys()]) this.close(id)
  }
}
