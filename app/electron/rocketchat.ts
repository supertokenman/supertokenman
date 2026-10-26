// Team chat: your own Rocket.Chat server (MIT; only its REST API is used, nothing of the ee/ folder) in the
// One inbox. Direct messages and mentions come in as conversations; a reply goes out only when you
// approve it; app alerts go to one channel you choose, only for the kinds you turn on. The personal
// access token and user id stay in the vault.

export type RcConfig = { url: string; alertRoom?: string; alerts?: { turns?: boolean; ci?: boolean } }
export type RcCreds = { userId: string; token: string }
export type RcItem = { id: string; thread: string; room: string; roomName: string; kind: 'direct' | 'mention'; from: { name: string; handle: string }; text: string; at: string; url: string; unread: boolean }

type Fetch = typeof fetch
type Msg = { _id: string; rid: string; msg: string; ts: string; u: { _id: string; username: string; name?: string }; tmid?: string; mentions?: { _id: string; username?: string }[]; t?: string }
type Sub = { rid: string; name: string; fname?: string; t: 'd' | 'c' | 'p'; unread: number; userMentions: number; alert?: boolean }

export function checkUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return 'Use the https address of your Rocket.Chat server.'
    return null
  } catch {
    return 'Not an address.'
  }
}

export function rocketChat(cfg: () => RcConfig | null, creds: () => RcCreds | null, f: Fetch = fetch) {
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const c = cfg()
    const k = creds()
    if (!c?.url || !k) throw new Error('Connect your Rocket.Chat server first.')
    const r = await f(`${c.url.replace(/\/+$/, '')}/api/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: { 'X-User-Id': k.userId, 'X-Auth-Token': k.token, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    })
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string }
    if (!r.ok || j.success === false) throw new Error(`Rocket.Chat answered ${r.status}${j.error || j.message ? `: ${j.error ?? j.message}` : ''}`)
    return j as Record<string, unknown>
  }
  let me: { _id: string; username: string; name: string } | null = null
  const whoami = async () => (me ??= (await call('me')) as unknown as { _id: string; username: string; name: string })
  const history = (s: Sub) => call(`${s.t === 'd' ? 'im' : s.t === 'c' ? 'channels' : 'groups'}.history?roomId=${encodeURIComponent(s.rid)}&count=15`)

  return {
    /** Who the token belongs to: the check behind Connect. */
    async me() {
      me = null
      const m = await whoami()
      return { username: m.username, name: m.name }
    },
    /** Direct messages and messages that mention you, newest per room or thread. */
    async inbox(): Promise<RcItem[]> {
      const u = await whoami()
      const subs = ((await call('subscriptions.get')).update as Sub[] | undefined) ?? []
      const base = cfg()!.url.replace(/\/+$/, '')
      const out: RcItem[] = []
      for (const s of subs.filter((x) => (x.t === 'd' && x.unread > 0) || x.userMentions > 0).slice(0, 30)) {
        const msgs = ((await history(s)).messages as Msg[] | undefined) ?? []
        const mine = (m: Msg) => m.u._id === u._id
        const hit = msgs.find((m) => !mine(m) && !m.t && (s.t === 'd' || (m.mentions ?? []).some((x) => x._id === u._id || x.username === 'here' || x.username === 'all')))
        if (!hit) continue
        const thread = hit.tmid ?? s.rid
        out.push({ id: hit._id, thread: `${s.rid}/${thread}`, room: s.rid, roomName: s.t === 'd' ? `@${s.name}` : `#${s.fname ?? s.name}`, kind: s.t === 'd' ? 'direct' : 'mention', from: { name: hit.u.name ?? hit.u.username, handle: `@${hit.u.username}` }, text: hit.msg, at: hit.ts, url: `${base}/${s.t === 'd' ? 'direct' : s.t === 'c' ? 'channel' : 'group'}/${encodeURIComponent(s.name)}${hit.tmid ? `/thread/${hit.tmid}` : ''}`, unread: s.unread > 0 })
      }
      return out
    },
    /** A reply in the room, inside the thread when the message was in one. Called only after Approve. */
    async reply(item: Pick<RcItem, 'room' | 'thread'>, text: string) {
      const [room, thread] = item.thread.split('/')
      await call('chat.postMessage', { method: 'POST', body: { roomId: room, text, ...(thread && thread !== room ? { tmid: thread } : {}) } })
    },
    /** One line to the alert channel, for the kinds turned on. */
    async alert(kind: 'turns' | 'ci' | 'test', text: string) {
      const c = cfg()
      if (!c?.alertRoom || (kind !== 'test' && !c.alerts?.[kind])) return false
      await call('chat.postMessage', { method: 'POST', body: { channel: c.alertRoom, text: `SuperTokenMan: ${text}` } })
      return true
    },
  }
}
