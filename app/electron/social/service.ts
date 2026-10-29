// The social service in the main process: credentials in and out of the vault, refreshing, the
// queue file and the scheduler. The window only ever gets what this returns: no tokens.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { bluesky, bskyRefresh, bskySession, mastoCred, mastodon } from './open.js'
import type { AccountId, Cred, NetworkId } from './core.js'
import { ACCOUNTS, credFromFields, hostOf, mastoLimit } from '../../shared/accounts.js'
import type { Net } from '../../shared/social.js'
import { makeFetcher } from './core.js'
import { metaIds, NETWORKS, OAUTH, ORDER, SETUP } from './networks.js'
import { authorizeUrl, exchange, pkce, redirectFor, refreshed, waitForCode } from './oauth.js'
import { catchUp } from '../../shared/missed.js'
import { nextSlotFor, type NetSlots } from '../../shared/postslots.js'
import { cleanItem, dueNetworks, problem, textFor, type Item } from './queue.js'
import { credName, readCred, secretsOf, writeCred, type VaultLike } from './store.js'

export type SocialDeps = {
  vault: VaultLike
  queueFile: string
  openLogin: (url: string) => void
  notify: (title: string, body: string) => void
  guard: () => void
  doFetch?: typeof fetch
}

const OPEN = (n: NetworkId) => {
  if (n === 'bluesky') return bluesky
  if (n === 'mastodon') return mastodon
  throw new Error('Only Bluesky and Mastodon give a timeline to ordinary apps.')
}

export function socialService(d: SocialDeps) {
  const doFetch = d.doFetch ?? fetch
  const f = (c: Cred | null) => makeFetcher(doFetch, () => secretsOf(c))

  async function cred(n: NetworkId): Promise<Cred> {
    const c = readCred(d.vault, n)
    if (!c) throw new Error(`${NETWORKS[n].name} is not connected.`)
    const fresh = await (n === 'bluesky' ? bskyRefresh(f(c), c) : refreshed(OAUTH[n], f(c), c)).catch(() => null)
    if (fresh) writeCred(d.vault, n, fresh)
    return fresh ?? c
  }

  const status = () =>
    ORDER.map((n) => ({
      id: n,
      name: NETWORKS[n].name,
      can: NETWORKS[n].can,
      connected: Boolean(readCred(d.vault, n)),
      oauth: Boolean(OAUTH[n]),
      redirect: OAUTH[n] ? redirectFor(n) : undefined,
      steps: SETUP[n],
    }))

  /** A token pasted from the network's developer tools. Meta tokens also find the Page and Instagram ids. */
  async function connectToken(n: NetworkId, token: string) {
    d.guard()
    let c: Cred = n === 'bluesky' ? await bskySession(f(null), token) : n === 'mastodon' ? mastoCred(token) : { accessToken: token.trim() }
    if (n === 'instagram' || n === 'facebook') {
      const ids = await metaIds(f(c), c.accessToken)
      if (!ids.page) throw new Error('This token sees no Facebook Page. Generate it with pages_show_list and a Page you manage.')
      if (n === 'instagram' && !ids.igUser) throw new Error(`The Page "${ids.pageName}" has no Instagram Business or Creator account linked.`)
      // the Page token posts as the Page and does not expire while the user token is long-lived
      c = { accessToken: ids.pageToken ?? c.accessToken, ids: { page: ids.page, ...(ids.igUser ? { igUser: ids.igUser } : {}) } }
    }
    const profile = await NETWORKS[n].profile(c, f(c))
    if (n === 'linkedin') c.ids = { person: profile.id }
    writeCred(d.vault, n, c)
    return profile
  }

  /** Sign in on the network's own page; the code comes back to this Mac and becomes tokens here. */
  async function connectOAuth(n: NetworkId, clientId: string, clientSecret?: string) {
    d.guard()
    const spec = OAUTH[n]
    if (!spec) throw new Error(`${NETWORKS[n].name} connects with a pasted token.`)
    const p = pkce()
    const code = waitForCode(n, p.state)
    d.openLogin(authorizeUrl(spec, n, clientId.trim(), p))
    const c = await exchange(spec, f(null), n, clientId.trim(), clientSecret?.trim() || undefined, await code, p.verifier)
    const profile = await NETWORKS[n].profile(c, f(c))
    if (n === 'linkedin') c.ids = { person: profile.id }
    writeCred(d.vault, n, c)
    return profile
  }

  function disconnect(n: AccountId) {
    d.guard()
    d.vault.delete(credName(n))
  }

  /** The networks that connect by pasting keys, as Post everywhere and Mentions see them: no secrets. */
  const accounts = () =>
    ACCOUNTS.map((n) => {
      const c = readCred(d.vault, n)
      return { net: n, connected: Boolean(c), host: c ? hostOf(n, c) : null, mastodonLimit: n === 'mastodon' ? mastoLimit(c) : undefined }
    })

  /** One connection per network, shared by every feature. Bluesky signs in now and keeps only the session. */
  async function connectFields(n: Net, fields: Record<string, unknown>) {
    d.guard()
    writeCred(d.vault, n, n === 'bluesky' ? await bskySession(f(null), fields) : credFromFields(n, fields))
    return accounts()
  }

  /** The saved credential for the main process only, refreshed when it is about to expire. */
  const account = async (n: AccountId): Promise<Cred | null> => (readCred(d.vault, n) ? (n in NETWORKS ? cred(n as NetworkId) : readCred(d.vault, n)) : null)

  const call = async <T>(n: NetworkId, fn: (c: Cred) => Promise<T>) => {
    const c = await cred(n)
    return fn(c)
  }

  // the queue: a plain file, no secrets in it
  const readQueue = (): Item[] => {
    try {
      return existsSync(d.queueFile) ? (JSON.parse(readFileSync(d.queueFile, 'utf8')) as Item[]).map((i) => cleanItem(i)) : []
    } catch {
      return []
    }
  }
  const writeQueue = (q: Item[]) => writeFileSync(d.queueFile, JSON.stringify(q, null, 2))
  const saveItem = (i: Partial<Item>) => {
    const next = cleanItem(i)
    const q = readQueue()
    const k = q.findIndex((x) => x.id === next.id)
    // an edit takes the approval back: the person approves what will actually go out
    // so does a new time or a changed version for one network; comments do not
    const kept = k >= 0 && q[k]!.text === next.text && q[k]!.mediaUrl === next.mediaUrl && q[k]!.networks.join() === next.networks.join() && q[k]!.when === next.when && JSON.stringify(q[k]!.variants ?? {}) === JSON.stringify(next.variants ?? {}) ? next.approved : false
    const item = { ...next, approved: k >= 0 ? kept : false, results: k >= 0 ? q[k]!.results : {} }
    writeQueue(k >= 0 ? q.map((x, j) => (j === k ? item : x)) : [item, ...q])
    return readQueue()
  }
  const approve = (id: string, on: boolean) => {
    // approved with no time means now: it gets the moment, so the calendar shows where it went out
    const q = readQueue().map((x) => (x.id === id ? { ...x, approved: on, when: on && x.when == null ? Date.now() : x.when } : x))
    const it = q.find((x) => x.id === id)
    if (on && it) {
      const bad = it.networks.map((n) => [n, problem(it, n)] as const).filter(([, p]) => p)
      if (bad.length) throw new Error(bad.map(([n, p]) => `${NETWORKS[n].name}: ${p}`).join(' '))
      const off = it.networks.filter((n) => !readCred(d.vault, n))
      if (off.length) throw new Error(`Connect ${off.map((n) => NETWORKS[n].name).join(', ')} first.`)
    }
    writeQueue(q)
    if (on) void tick()
    return readQueue()
  }
  const retry = (id: string) => {
    writeQueue(readQueue().map((x) => (x.id === id ? { ...x, results: Object.fromEntries(Object.entries(x.results).filter(([, r]) => r?.ok)) } : x)))
    void tick()
    return readQueue()
  }
  /** A new time from the calendar: an approved item that has not gone out yet waits for Approve again. */
  const move = (id: string, when: number | null) => {
    writeQueue(readQueue().map((x) => (x.id === id && !Object.values(x.results).some((r) => r?.ok) ? { ...x, when, held: false, approved: x.when === when ? x.approved : false } : x)))
    return readQueue()
  }
  /** On launch and after sleep: a little late posts now, a lot late is held for the person. Returns how many were held. */
  function catchUpNow(now = Date.now()) {
    const { held } = catchUp(readQueue(), now)
    if (held.length) writeQueue(readQueue().map((x) => (held.some((h) => h.id === x.id) ? { ...x, held: true } : x)))
    void tick()
    return held.length
  }
  const heldItems = () => readQueue().filter((x) => x.held)
  const postNow = (id: string) => {
    writeQueue(readQueue().map((x) => (x.id === id && x.held ? { ...x, held: false, when: Date.now() } : x)))
    void tick()
    return heldItems()
  }
  /** Skip: the item goes back to a draft; nothing is posted. */
  const skip = (id: string) => {
    writeQueue(readQueue().map((x) => (x.id === id && x.held ? { ...x, held: false, approved: false } : x)))
    return heldItems()
  }
  /** The next free slot of one network, taken only by queued items that list that network. */
  const nextSlot = (slots: NetSlots, network: string, now = new Date()) =>
    nextSlotFor(slots, network, readQueue().flatMap((i) => (i.networks as string[]).includes(network) ? [{ id: i.id, network, when: i.when }] : []), now)
  const comment = (id: string, text: string) => {
    if (!text.trim()) return readQueue()
    writeQueue(readQueue().map((x) => (x.id === id ? cleanItem({ ...x, comments: [...(x.comments ?? []), { at: Date.now(), text }] }) : x)))
    return readQueue()
  }
  const removeItem = (id: string) => (writeQueue(readQueue().filter((x) => x.id !== id)), readQueue())

  let running = false
  async function tick() {
    if (running) return
    running = true
    try {
      for (const it of readQueue()) {
        const nets = dueNetworks(it, Date.now())
        for (const n of nets) {
          let r
          try {
            const out = await call(n, (c) => NETWORKS[n].publish!(c, f(c), { ...it, text: textFor(it, n) }))
            r = { ok: true, at: Date.now(), url: out.url }
            d.notify(`Posted on ${NETWORKS[n].name}`, it.text.slice(0, 80))
          } catch (e) {
            r = { ok: false, at: Date.now(), error: e instanceof Error ? e.message : String(e) }
            d.notify(`${NETWORKS[n].name} did not post`, r.error)
          }
          // write each result as it happens, so a crash never posts the same thing twice
          writeQueue(readQueue().map((x) => (x.id === it.id ? { ...x, results: { ...x.results, [n]: r } } : x)))
        }
      }
    } finally {
      running = false
    }
  }

  return {
    status,
    connectToken,
    connectOAuth,
    disconnect,
    profile: (n: NetworkId) => call(n, (c) => NETWORKS[n].profile(c, f(c))),
    /** The home timeline of an open network, in the app's own design. */
    timeline: (n: NetworkId) => call(n, (c) => OPEN(n).timeline(c, f(c))),
    /** Mentions and replies to the account, for the one inbox. */
    mentions: (n: NetworkId) => call(n, (c) => OPEN(n).mentions(c, f(c))),
    like: (n: NetworkId, id: string) => call(n, (c) => OPEN(n).like(c, f(c), id)),
    repost: (n: NetworkId, id: string) => call(n, (c) => OPEN(n).repost(c, f(c), id)),
    posts: (n: NetworkId) => call(n, (c) => NETWORKS[n].posts(c, f(c))),
    comments: (n: NetworkId, postId: string) => call(n, (c) => (NETWORKS[n].comments ? NETWORKS[n].comments!(c, f(c), postId) : Promise.resolve([]))),
    reply: (n: NetworkId, commentId: string, text: string, postId?: string) =>
      call(n, (c) => {
        if (!NETWORKS[n].reply) throw new Error(`${NETWORKS[n].name} does not allow replies through its API.`)
        return NETWORKS[n].reply!(c, f(c), commentId, text, postId)
      }),
    accounts,
    connectFields,
    account,
    queue: readQueue,
    saveItem,
    approve,
    move,
    comment,
    retry,
    removeItem,
    catchUp: catchUpNow,
    held: heldItems,
    postNow,
    skip,
    nextSlot,
    tick,
  }
}
