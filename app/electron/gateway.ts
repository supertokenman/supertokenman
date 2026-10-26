// Phase 100: a local gateway between each panel and the API. A panel on the paid key gets a token of
// its own and this address as its base URL; the gateway checks the token, swaps it for the key from
// the vault and passes the request on to one fixed upstream. The panel's process never holds the
// key. Bound to 127.0.0.1 only, a rate limit per panel, and a log with no headers or bodies.
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'

export type LogLine = { at: number; panel: string; method: string; path: string; status: number; ms: number }
export type GatewayOpts = {
  /** where requests go, fixed: https://api.anthropic.com unless the person set another */
  upstream: () => string
  key: () => string | null
  perMinute?: number
  /** a local upstream (a test server, Headroom) is allowed only when named here */
  allowLocal?: (host: string) => boolean
  onLog?: (l: LogLine) => void
}

/** Hosts a gateway must never forward to unless allowed: loopback, private, link-local, metadata. */
export function internal(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h === 'metadata.google.internal') return true
  if (isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number) as [number, number]
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)
  }
  if (isIP(h) === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h === '::'
  return false
}

export class Gateway {
  private server: Server | null = null
  private tokens = new Map<string, string>()
  private hits = new Map<string, number[]>()
  port = 0
  constructor(private o: GatewayOpts) {}

  async start(): Promise<number> {
    if (this.server) return this.port
    this.server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((done) => this.server!.listen(0, '127.0.0.1', done))
    this.port = (this.server.address() as { port: number }).port
    return this.port
  }
  stop() {
    this.server?.close()
    this.server = null
  }

  /** A token for one panel; the panel's environment carries it instead of the key. */
  tokenFor(panel: string): string {
    for (const [t, p] of this.tokens) if (p === panel) return t
    const t = `stm-gw-${randomBytes(18).toString('hex')}`
    this.tokens.set(t, panel)
    return t
  }
  revoke(panel: string) {
    for (const [t, p] of this.tokens) if (p === panel) this.tokens.delete(t)
  }
  envFor(panel: string): Record<string, string> {
    return { ANTHROPIC_BASE_URL: `http://127.0.0.1:${this.port}`, ANTHROPIC_API_KEY: this.tokenFor(panel) }
  }

  private allow(panel: string): boolean {
    const now = Date.now()
    const h = (this.hits.get(panel) ?? []).filter((t) => now - t < 60_000)
    if (h.length >= (this.o.perMinute ?? 120)) return (this.hits.set(panel, h), false)
    h.push(now)
    this.hits.set(panel, h)
    return true
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const t0 = Date.now()
    // the token may come as x-api-key or as a bearer token, depending on how the CLI authenticates
    const panel = [String(req.headers['x-api-key'] ?? ''), String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')].map((t) => this.tokens.get(t.trim())).find(Boolean)
    const path = String(req.url ?? '/')
    const done = (status: number, body?: string) => {
      if (body !== undefined) res.writeHead(status, { 'content-type': 'application/json' }).end(body)
      this.o.onLog?.({ at: t0, panel: panel ?? '?', method: String(req.method), path: path.split('?')[0]!, status, ms: Date.now() - t0 })
    }
    const fail = (status: number, message: string) => done(status, JSON.stringify({ type: 'error', error: { type: 'gateway_error', message } }))
    if (!panel) return fail(401, 'Unknown panel token.')
    if (!/^\/v1\//.test(path)) return fail(404, 'Only /v1/ paths go through the gateway.')
    if (!this.allow(panel)) return fail(429, 'This panel is over its request limit for this minute.')
    const key = this.o.key()
    if (!key) return fail(503, 'No ANTHROPIC_API_KEY in the vault.')
    let up: URL
    try {
      up = new URL(path, this.o.upstream())
    } catch {
      return fail(502, 'The upstream address is not valid.')
    }
    if (up.protocol !== 'https:' && up.protocol !== 'http:') return fail(502, 'The upstream must be http(s).')
    if (internal(up.hostname) && !this.o.allowLocal?.(up.host)) return fail(403, `Refused: ${up.hostname} is an internal address.`)
    const headers: Record<string, string | string[]> = {}
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !/^(host|x-api-key|authorization|connection|content-length)$/i.test(k)) headers[k] = v
    headers['x-api-key'] = key
    if (req.headers['content-length']) headers['content-length'] = String(req.headers['content-length'])
    const send = up.protocol === 'https:' ? httpsRequest : httpRequest
    const out = send(up, { method: req.method, headers }, (r) => {
      // streamed answers (SSE) pass through as they come
      res.writeHead(r.statusCode ?? 502, Object.fromEntries(Object.entries(r.headers).filter(([k]) => !/^(connection|transfer-encoding)$/i.test(k))) as Record<string, string>)
      r.pipe(res)
      r.on('end', () => done(r.statusCode ?? 502))
    })
    out.on('error', (e) => (res.headersSent ? res.destroy() : fail(502, `Upstream: ${e.message}`)))
    req.pipe(out)
  }
}
