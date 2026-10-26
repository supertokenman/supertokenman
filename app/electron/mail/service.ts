// Mail and calendars in the main process: Outlook (Microsoft Graph) and Gmail (Google's APIs) behind
// one set of calls, so the window draws one mail screen and one agenda for both. Each account's
// credential is one vault entry, never marked for commands; errors never carry a token.
import type { Event } from '../calendar.js'
import { makeFetcher, type Cred, type Fetcher } from '../social/core.js'
import { authorizeUrl, exchange, pkce, refreshed, waitForCode, type OAuthSpec } from '../social/oauth.js'
import type { VaultLike } from '../social/store.js'
import { GCAL, GMAIL, GOOGLE, gmailItem, gmailListUrl, gmailMessage, googleEvents, people, rawMail, replyHeaders, safeGid, type GMsg } from './google.js'
import { FOLDERS, GRAPH, OUTLOOK, calendarUrl, isFolder, listUrl, outlookEvents, recipients, safeId, safeNext, toItem, toMessage, type Folder, type MailMessage, type MailPage } from './outlook.js'

export type Account = 'outlook' | 'gmail'
export const ACCOUNTS: Account[] = ['outlook', 'gmail']
export const isAccount = (a: unknown): a is Account => a === 'outlook' || a === 'gmail'
export const MAIL_KEY = 'MAIL_OUTLOOK'
const KEY: Record<Account, string> = { outlook: MAIL_KEY, gmail: 'MAIL_GMAIL' }
const SPEC: Record<Account, OAuthSpec> = { outlook: OUTLOOK, gmail: GOOGLE }
type Saved = Cred & { account?: { name: string; address: string } }

export type MailDeps = { vault: VaultLike; guard: () => void; openLogin: (url: string) => void; fetch?: typeof fetch }
type Out = { to: string; cc?: string; subject: string; text: string }

const emails = (text: string) => recipients(text).map((r) => r.emailAddress.address)

export function mailService(d: MailDeps) {
  const doFetch = d.fetch ?? fetch
  const read = (a: Account): Saved | null => {
    try {
      const c = JSON.parse(d.vault.get(KEY[a]) ?? 'null') as Saved | null
      return c?.accessToken ? c : null
    } catch {
      return null
    }
  }
  const write = (a: Account, c: Saved) => d.vault.set(KEY[a], JSON.stringify(c), false)
  const fetcher = (c: Saved | null): Fetcher => makeFetcher(doFetch, () => (c ? [c.accessToken, c.refreshToken ?? '', c.clientSecret ?? ''].filter(Boolean) : []))
  const name = (a: Account) => (a === 'outlook' ? 'Outlook' : 'Gmail')

  /** A call with a fresh token; a refused token is reported as signed out. */
  async function api<T>(a: Account, fn: (f: Fetcher) => Promise<T>): Promise<T> {
    let c = read(a)
    if (!c) throw new Error(`${name(a)} is not connected.`)
    const fresh = await refreshed(SPEC[a], fetcher(c), c).catch(() => null)
    if (fresh) {
      c = { ...c, ...fresh }
      write(a, c)
    }
    const auth = c.accessToken
    const base = fetcher(c)
    const extra: Record<string, string> = a === 'outlook' ? { Prefer: 'outlook.body-content-type="html", outlook.timezone="UTC"' } : {}
    const f: Fetcher = (url, init) => base(url, { ...init, headers: { Authorization: `Bearer ${auth}`, ...extra, ...(init?.headers ?? {}) } })
    try {
      return await fn(f)
    } catch (e) {
      if (/answered 401/.test((e as Error).message)) throw new Error(`${name(a)} signed you out. Connect again.`)
      throw e
    }
  }
  const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const outlook = {
    list: (folder: Folder, search?: string, next?: string) =>
      api('outlook', async (f): Promise<MailPage> => {
        const j = (await f(safeNext(next) ?? listUrl(folder, search))) as { value?: never[]; '@odata.nextLink'?: string }
        return { items: (j.value ?? []).map(toItem), next: safeNext(j['@odata.nextLink']) }
      }),
    unread: () => api('outlook', async (f) => ((await f(`${GRAPH}/me/mailFolders/inbox?$select=unreadItemCount`)) as { unreadItemCount?: number }).unreadItemCount ?? 0),
    get: (id: unknown) => api('outlook', async (f) => toMessage((await f(`${GRAPH}/me/messages/${safeId(id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,isRead,hasAttachments,flag,conversationId,webLink`)) as never)),
    markRead: (id: unknown, r: boolean) => api('outlook', async (f) => void (await f(`${GRAPH}/me/messages/${safeId(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead: Boolean(r) }) }))),
    move: (id: unknown, to: Folder) => api('outlook', async (f) => void (await f(`${GRAPH}/me/messages/${safeId(id)}/move`, json({ destinationId: to })))),
    reply: (id: unknown, text: string, all: boolean) => api('outlook', async (f) => void (await f(`${GRAPH}/me/messages/${safeId(id)}/${all ? 'replyAll' : 'reply'}`, json({ comment: text })))),
    send: (m: Out) =>
      api('outlook', async (f) => {
        const message = { subject: m.subject, body: { contentType: 'Text', content: m.text }, toRecipients: recipients(m.to), ccRecipients: m.cc ? recipients(m.cc) : [] }
        await f(`${GRAPH}/me/sendMail`, json({ message, saveToSentItems: true }))
      }),
    events: (from: Date, to: Date) =>
      api('outlook', async (f) => {
        try {
          return outlookEvents(((await f(calendarUrl(from, to))) as { value?: never[] }).value ?? [])
        } catch (e) {
          // connected before the calendar permission existed
          if (/answered 403/.test((e as Error).message)) throw new Error('Connect Outlook again to allow its calendar.')
          throw e
        }
      }),
  }

  const gmail = {
    list: (folder: Folder, search?: string, next?: string) =>
      api('gmail', async (f): Promise<MailPage> => {
        const page = typeof next === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(next) ? next : undefined
        const j = (await f(gmailListUrl(folder, search, 30, page))) as { messages?: { id: string }[]; nextPageToken?: string }
        const ids = (j.messages ?? []).map((m) => m.id)
        // the list gives ids only: their headers come a few at a time
        const items = []
        for (let i = 0; i < ids.length; i += 10)
          items.push(...(await Promise.all(ids.slice(i, i + 10).map(async (id) => gmailItem((await f(`${GMAIL}/messages/${safeGid(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)) as GMsg)))))
        return { items, next: j.nextPageToken }
      }),
    unread: () => api('gmail', async (f) => ((await f(`${GMAIL}/labels/INBOX`)) as { messagesUnread?: number }).messagesUnread ?? 0),
    get: (id: unknown) => api('gmail', async (f): Promise<MailMessage> => gmailMessage((await f(`${GMAIL}/messages/${safeGid(id)}?format=full`)) as GMsg)),
    markRead: (id: unknown, r: boolean) => api('gmail', async (f) => void (await f(`${GMAIL}/messages/${safeGid(id)}/modify`, json(r ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] })))),
    move: (id: unknown, to: Folder) =>
      api('gmail', async (f) => {
        const gid = safeGid(id)
        if (to === 'deleteditems') return void (await f(`${GMAIL}/messages/${gid}/trash`, json({})))
        const change: Partial<Record<Folder, object>> = { archive: { removeLabelIds: ['INBOX'] }, inbox: { addLabelIds: ['INBOX'], removeLabelIds: ['SPAM', 'TRASH'] }, junkemail: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] } }
        if (!change[to]) throw new Error('Gmail cannot move a message there.')
        await f(`${GMAIL}/messages/${gid}/modify`, json(change[to]))
      }),
    reply: (id: unknown, text: string, all: boolean) =>
      api('gmail', async (f) => {
        const gid = safeGid(id)
        const orig = (await f(`${GMAIL}/messages/${gid}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Reply-To&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`)) as GMsg
        const h = replyHeaders(orig)
        const me = read('gmail')?.account?.address?.toLowerCase()
        const to = people(h.replyTo || h.from).map((p) => p.address)
        const cc = all ? [...people(h.to), ...people(h.cc)].map((p) => p.address).filter((a) => a.toLowerCase() !== me && !to.includes(a)) : []
        const subject = /^re:/i.test(h.subject) ? h.subject : `Re: ${h.subject}`
        await f(`${GMAIL}/messages/send`, json({ raw: rawMail({ to, cc, subject, text, inReplyTo: h.messageId, references: h.references }), threadId: orig.threadId }))
      }),
    send: (m: Out) => api('gmail', async (f) => void (await f(`${GMAIL}/messages/send`, json({ raw: rawMail({ to: emails(m.to), cc: m.cc ? emails(m.cc) : [], subject: m.subject, text: m.text }) })))),
    events: (from: Date, to: Date) =>
      api('gmail', async (f) => {
        const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
        return googleEvents(((await f(`${GCAL}/calendars/primary/events?${q}`)) as { items?: never[] }).items ?? [])
      }),
  }
  const P = { outlook, gmail }
  const acct = (a: unknown): Account => {
    if (!isAccount(a)) throw new Error('Not a mail account.')
    return a
  }

  return {
    folders: FOLDERS,
    status: () => Object.fromEntries(ACCOUNTS.map((a) => [a, { connected: Boolean(read(a)), account: read(a)?.account ?? null }])) as Record<Account, { connected: boolean; account: { name: string; address: string } | null }>,
    /** The provider's own sign-in page opens; the code comes back to this Mac and becomes tokens here. */
    async connect(a: unknown, clientId: string, clientSecret?: string) {
      d.guard()
      const ac = acct(a)
      const id = String(clientId ?? '').trim()
      if (ac === 'outlook' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('The Application (client) ID is a GUID, like 1a2b3c4d-....')
      if (ac === 'gmail' && !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new Error('The client ID ends in .apps.googleusercontent.com.')
      const secret = ac === 'gmail' ? String(clientSecret ?? '').trim() || undefined : undefined
      if (ac === 'gmail' && !secret) throw new Error('Paste the client secret too (Google gives Desktop apps one).')
      const p = pkce()
      const code = waitForCode(ac, p.state, 300_000, SPEC[ac].host)
      d.openLogin(authorizeUrl(SPEC[ac], ac, id, p))
      const c: Saved = await exchange(SPEC[ac], fetcher(null), ac, id, secret, await code, p.verifier)
      const auth = { headers: { Authorization: `Bearer ${c.accessToken}` } }
      if (ac === 'outlook') {
        const me = (await fetcher(c)(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`, auth)) as { displayName?: string; mail?: string; userPrincipalName?: string }
        c.account = { name: me.displayName ?? '', address: me.mail ?? me.userPrincipalName ?? '' }
      } else {
        const me = (await fetcher(c)(`${GMAIL}/profile`, auth)) as { emailAddress?: string }
        c.account = { name: me.emailAddress ?? '', address: me.emailAddress ?? '' }
      }
      write(ac, c)
      return c.account
    },
    disconnect(a: unknown) {
      d.guard()
      d.vault.delete(KEY[acct(a)])
    },
    list: (a: unknown, folder: unknown, search?: unknown, next?: unknown) => P[acct(a)].list(isFolder(folder) ? folder : 'inbox', typeof search === 'string' ? search.slice(0, 200) : undefined, typeof next === 'string' ? next : undefined),
    unread: (a: unknown) => P[acct(a)].unread(),
    get: (a: unknown, id: unknown) => P[acct(a)].get(id),
    markRead: (a: unknown, id: unknown, r: boolean) => P[acct(a)].markRead(id, Boolean(r)),
    move: (a: unknown, id: unknown, to: unknown) => {
      if (!isFolder(to)) throw new Error('Not a folder.')
      return P[acct(a)].move(id, to)
    },
    reply: (a: unknown, id: unknown, text: string, all: boolean) => {
      if (!String(text ?? '').trim()) throw new Error('Write the reply first.')
      return P[acct(a)].reply(id, String(text).slice(0, 100_000), Boolean(all))
    },
    send: (a: unknown, m: Out) => {
      if (!String(m?.to ?? '').trim()) throw new Error('Who is it to?')
      return P[acct(a)].send({ to: String(m.to), cc: m.cc ? String(m.cc) : undefined, subject: String(m.subject ?? '').slice(0, 500), text: String(m.text ?? '').slice(0, 100_000) })
    },
    /** Every connected account's calendar for the agenda; one that fails says why and the rest still show. */
    async events(from: Date, to: Date): Promise<{ events: Event[]; errors: { calendar: string; error: string }[] }> {
      const out = { events: [] as Event[], errors: [] as { calendar: string; error: string }[] }
      for (const a of ACCOUNTS) {
        if (!read(a)) continue
        try {
          out.events.push(...(await P[a].events(from, to)))
        } catch (e) {
          out.errors.push({ calendar: name(a), error: (e as Error).message })
        }
      }
      return out
    },
  }
}
