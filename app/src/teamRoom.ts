// Team room client: an invite carries the relay, the room and its key. Messages are sealed here with
// AES-GCM before they leave the machine; the relay only passes ciphertext. Each member runs their own
// Claude: what travels is presence, chat and hand-offs, never anyone's account.

export type Invite = { relay: string; room: string; key: string }
export type Member = { id: string; name: string; repo?: string; branch?: string; status?: string; at: number }
export type Note =
  | { kind: 'presence'; name: string; repo?: string; branch?: string; status?: string }
  | { kind: 'chat'; name: string; text: string }
  | { kind: 'handoff'; name: string; title: string; text: string; repo?: string; branch?: string }
export type Entry = { from: string; at: number; note: Note }

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** A new room on a relay: random id and a 256-bit key, both only in the invite. */
export const newInvite = (relay: string): Invite => ({ relay: relay.replace(/\/+$/, ''), room: b64u(rand(18)), key: b64u(rand(32)) })

export const encodeInvite = (i: Invite) => `stm-team:${b64u(new TextEncoder().encode(JSON.stringify(i)))}`
export function decodeInvite(text: string): Invite {
  const m = text.trim().match(/^stm-team:([A-Za-z0-9_-]+)$/)
  if (!m) throw new Error('Not a team invite.')
  const i = JSON.parse(new TextDecoder().decode(unb64u(m[1]!))) as Invite
  if (!/^(https?|wss?):\/\//.test(i.relay) || !/^[A-Za-z0-9_-]{16,64}$/.test(i.room) || unb64u(i.key).length !== 32) throw new Error('This invite is damaged.')
  return i
}

/** The token the relay checks: a hash of the key, so the relay learns nothing that opens messages. */
export async function tokenOf(key: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array([...unb64u(key), ...new TextEncoder().encode('stm-room-token')]))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const aes = (key: string) => crypto.subtle.importKey('raw', unb64u(key), 'AES-GCM', false, ['encrypt', 'decrypt'])

export async function seal(key: string, note: Note): Promise<{ iv: string; data: string }> {
  const iv = rand(12)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), new TextEncoder().encode(JSON.stringify(note)))
  return { iv: b64u(iv), data: b64u(new Uint8Array(data)) }
}
export async function open(key: string, iv: string, data: string): Promise<Note | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await aes(key), unb64u(data))
    return JSON.parse(new TextDecoder().decode(plain)) as Note
  } catch {
    // not sealed with this room's key: dropped
    return null
  }
}

export type RoomEvents = { onEntry: (e: Entry) => void; onMembers: (m: Member[]) => void; onState: (s: 'connecting' | 'live' | 'offline', why?: string) => void }

/** One connection to a room, reconnecting with backoff, announcing presence every 20 s. */
export class TeamRoom {
  private ws?: WebSocket
  private members = new Map<string, Member>()
  private timer?: ReturnType<typeof setInterval>
  private retry = 0
  private closed = false
  constructor(
    private invite: Invite,
    private me: { id: string; name: string },
    private ev: RoomEvents,
    private presence: () => Omit<Extract<Note, { kind: 'presence' }>, 'kind' | 'name'> = () => ({}),
  ) {}

  async connect() {
    this.ev.onState('connecting')
    const token = await tokenOf(this.invite.key)
    const base = this.invite.relay.replace(/^http/, 'ws')
    const ws = new WebSocket(`${base}/room/${this.invite.room}?token=${token}&member=${encodeURIComponent(this.me.id)}`)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.ev.onState('live')
      void this.ping()
      this.timer = setInterval(() => void this.ping(), 20_000)
    }
    ws.onmessage = (m) => void this.receive(String(m.data))
    ws.onclose = (e) => {
      if (this.timer) clearInterval(this.timer)
      if (this.closed) return
      this.ev.onState('offline', e.code === 1006 ? 'Relay unreachable' : e.reason || undefined)
      // back off 1, 2, 4... up to 30 s
      setTimeout(() => void this.connect(), Math.min(30_000, 1000 * 2 ** this.retry++))
    }
  }

  private async receive(raw: string) {
    const m = JSON.parse(raw) as { t: string; items?: { from: string; at: number; iv: string; data: string }[]; from?: string; at?: number; iv?: string; data?: string; member?: string }
    const items = m.t === 'history' ? (m.items ?? []) : m.t === 'msg' ? [{ from: m.from!, at: m.at!, iv: m.iv!, data: m.data! }] : []
    for (const it of items) {
      const note = await open(this.invite.key, it.iv, it.data)
      if (!note) continue
      if (note.kind === 'presence') {
        this.members.set(it.from, { id: it.from, name: note.name, repo: note.repo, branch: note.branch, status: note.status, at: it.at })
        this.ev.onMembers([...this.members.values()])
      } else this.ev.onEntry({ from: it.from, at: it.at, note })
    }
    if (m.t === 'left' && m.member) {
      this.members.delete(m.member)
      this.ev.onMembers([...this.members.values()])
    }
  }

  private async ping() {
    await this.send({ kind: 'presence', name: this.me.name, ...this.presence() }, false)
  }

  async send(note: Note, keep = true) {
    if (this.ws?.readyState !== WebSocket.OPEN) throw new Error('Not connected to the room.')
    this.ws.send(JSON.stringify({ t: 'msg', keep, ...(await seal(this.invite.key, note)) }))
  }

  close() {
    this.closed = true
    if (this.timer) clearInterval(this.timer)
    this.ws?.close()
  }
}
