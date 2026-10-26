// Phone companion server: local network only, off until turned on, paired by a code. Reads panels,
// answers permission asks, and sends messages only when that is also turned on.
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes, randomInt } from 'node:crypto'
import { authed, newPairing, openPairing, page, tryPair, type PanelView } from '../shared/companion.js'

export type CompanionDeps = {
  view: () => { panels: PanelView[]; today: string }
  answer: (sid: string, id: string, allow: boolean) => void
  send: (sid: string, text: string) => Promise<unknown>
  canSend: () => boolean
  host?: string
}

export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) return n.address
  return null
}

export function companion(deps: CompanionDeps) {
  const pairing = newPairing()
  let server: Server | null = null
  let port = 0
  const json = (res: import('node:http').ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  const body = (req: import('node:http').IncomingMessage) =>
    new Promise<Record<string, unknown>>((ok, fail) => {
      let s = ''
      req.on('data', (d) => ((s += d), s.length > 20_000 && (req.destroy(), fail(new Error('Too big')))))
      req.on('end', () => {
        try {
          ok(s ? JSON.parse(s) : {})
        } catch {
          fail(new Error('Bad JSON'))
        }
      })
    })
  const handle = async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0]
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'", 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' })
      return res.end(page())
    }
    if (req.method === 'POST' && path === '/api/pair') {
      const b = await body(req)
      const r = tryPair(pairing, String(b.code ?? ''), Date.now(), randomBytes(24).toString('base64url'), String(b.name ?? ''))
      return r.ok ? json(res, 200, { token: r.token }) : json(res, 403, { error: r.why })
    }
    if (!authed(pairing, req.headers.authorization)) return json(res, 401, { error: 'Pair first.' })
    if (req.method === 'GET' && path === '/api/state') return json(res, 200, { ...deps.view(), send: deps.canSend() })
    if (req.method === 'POST' && path === '/api/answer') {
      const b = await body(req)
      deps.answer(String(b.sid ?? ''), String(b.id ?? ''), b.allow === true)
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && path === '/api/send') {
      if (!deps.canSend()) return json(res, 403, { error: 'Sending from the phone is off.' })
      const b = await body(req)
      await deps.send(String(b.sid ?? ''), String(b.text ?? '').slice(0, 10_000))
      return json(res, 200, { ok: true })
    }
    json(res, 404, { error: 'Not found' })
  }
  return {
    async start(want: number) {
      if (server) return this.info()
      server = createServer((req, res) => void handle(req, res).catch((e: Error) => json(res, 400, { error: e.message })))
      await new Promise<void>((ok, fail) => (server!.once('error', fail), server!.listen(want, deps.host ?? '0.0.0.0', () => ok())))
      port = (server.address() as { port: number }).port
      return this.info()
    },
    async stop() {
      const s = server
      server = null
      pairing.tokens.clear()
      pairing.code = null
      await new Promise<void>((ok) => (s ? s.close(() => ok()) : ok()))
      s?.closeAllConnections()
      return this.info()
    },
    newCode: () => ({ code: openPairing(pairing, Date.now(), () => randomInt(0, 1_000_000) / 1_000_000), until: pairing.until }),
    forget: () => (pairing.tokens.clear(), true),
    info: () => ({ on: Boolean(server), url: server ? `http://${deps.host && deps.host !== '0.0.0.0' ? deps.host : (lanAddress() ?? '127.0.0.1')}:${port}` : null, phones: [...pairing.tokens.values()].map((t) => ({ name: t.name, at: t.at })) }),
  }
}
