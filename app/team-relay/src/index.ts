// The team room relay: one Durable Object per room passes sealed messages between the members' apps.
// It never sees the room key: payloads are AES-GCM ciphertext made on the members' machines. It keeps the
// last 200 for whoever joins later, and admits only clients that show the room's token (a hash of the key).
import { DurableObject } from 'cloudflare:workers'

type Env = { ROOMS: DurableObjectNamespace<Room> }
type Stored = { from: string; at: number; iv: string; data: string }

const ROOM = /^[A-Za-z0-9_-]{16,64}$/
const MEMBER = /^[A-Za-z0-9_-]{6,40}$/

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const m = url.pathname.match(/^\/room\/([^/]+)$/)
    if (!m || !ROOM.test(m[1]!)) return new Response('stm team relay', { status: 404 })
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    return env.ROOMS.get(env.ROOMS.idFromName(m[1]!)).fetch(req)
  },
}

export class Room extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') ?? ''
    const member = url.searchParams.get('member') ?? ''
    if (!/^[a-f0-9]{64}$/.test(token) || !MEMBER.test(member)) return new Response('bad request', { status: 400 })
    // the first member sets the room's token; everyone after must match it
    const known = await this.ctx.storage.get<string>('token')
    if (!known) await this.ctx.storage.put('token', token)
    else if (known !== token) return new Response('wrong room key', { status: 403 })

    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1], [member])
    const history = (await this.ctx.storage.get<Stored[]>('history')) ?? []
    pair[1].send(JSON.stringify({ t: 'history', items: history, peers: this.members() }))
    this.broadcast({ t: 'joined', member }, pair[1])
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  private members() {
    return [...new Set(this.ctx.getWebSockets().flatMap((w) => this.ctx.getTags(w)))]
  }

  private broadcast(msg: unknown, except?: WebSocket) {
    const s = JSON.stringify(msg)
    for (const w of this.ctx.getWebSockets()) if (w !== except) w.send(s)
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 256_000) return
    let m: { t?: string; iv?: string; data?: string; keep?: boolean }
    try {
      m = JSON.parse(raw)
    } catch {
      return
    }
    if (m.t !== 'msg' || typeof m.iv !== 'string' || typeof m.data !== 'string') return
    const out: Stored = { from: this.ctx.getTags(ws)[0] ?? '?', at: Date.now(), iv: m.iv, data: m.data }
    // presence pings pass through but are not kept
    if (m.keep !== false) {
      const history = (await this.ctx.storage.get<Stored[]>('history')) ?? []
      await this.ctx.storage.put('history', [...history, out].slice(-200))
    }
    this.broadcast({ t: 'msg', ...out })
  }

  async webSocketClose(ws: WebSocket) {
    const member = this.ctx.getTags(ws)[0]
    if (member && !this.members().filter((x) => x === member).length) this.broadcast({ t: 'left', member }, ws)
  }
}
