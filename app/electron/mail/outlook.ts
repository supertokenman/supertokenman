// Outlook through Microsoft Graph: the mail of a Microsoft account (Outlook.com, Hotmail, Live, or a
// work or school account), read and answered in the app's own interface. Sign-in is Microsoft's own
// page (OAuth with PKCE, a public client: no secret); the tokens live in the vault and are used only
// here, in the main process. The window gets messages, never a token.
import { joinLink, type Event } from '../calendar.js'
import { redirectFor, type OAuthSpec } from '../social/oauth.js'

export const GRAPH = process.env.STM_GRAPH_API ?? 'https://graph.microsoft.com/v1.0'

export const OUTLOOK: OAuthSpec = {
  authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  scopes: ['offline_access', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'Calendars.Read'],
  extra: { prompt: 'select_account' },
  clientAuth: 'body',
  host: 'localhost',
}

export type Folder = 'inbox' | 'archive' | 'sentitems' | 'drafts' | 'deleteditems' | 'junkemail'
export const FOLDERS: { id: Folder; name: string }[] = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'archive', name: 'Archive' },
  { id: 'sentitems', name: 'Sent' },
  { id: 'drafts', name: 'Drafts' },
  { id: 'junkemail', name: 'Junk' },
  { id: 'deleteditems', name: 'Deleted' },
]
const FOLDER_IDS = new Set(FOLDERS.map((f) => f.id))
export const isFolder = (f: unknown): f is Folder => typeof f === 'string' && FOLDER_IDS.has(f as Folder)

export type Person = { name: string; address: string }
export type MailItem = { id: string; subject: string; from: Person | null; at: string; preview: string; read: boolean; attachments: boolean; flagged: boolean; conversation?: string }
export type MailMessage = MailItem & { to: Person[]; cc: Person[]; html: string; webLink?: string }
export type MailPage = { items: MailItem[]; next?: string }

const LIST_FIELDS = 'id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,flag,conversationId'

/** The list of a folder, newest first, or a search across the whole mailbox. */
export function listUrl(folder: Folder, search?: string, top = 40) {
  const q = search?.trim()
  // Graph's $search does not take $orderby: results come ranked, newest first in practice
  if (q) return `${GRAPH}/me/messages?$search=${encodeURIComponent(`"${q.replace(/"/g, '')}"`)}&$top=${top}&$select=${LIST_FIELDS}`
  return `${GRAPH}/me/mailFolders/${folder}/messages?$top=${top}&$orderby=receivedDateTime%20desc&$select=${LIST_FIELDS}`
}

/** Only Graph's own next-page links are followed. */
export const safeNext = (url: unknown) => (typeof url === 'string' && url.startsWith(`${GRAPH}/`) ? url : undefined)

type GPerson = { emailAddress?: { name?: string; address?: string } }
type GMessage = {
  id: string
  subject?: string
  from?: GPerson
  receivedDateTime?: string
  bodyPreview?: string
  isRead?: boolean
  hasAttachments?: boolean
  flag?: { flagStatus?: string }
  conversationId?: string
  toRecipients?: GPerson[]
  ccRecipients?: GPerson[]
  body?: { contentType?: string; content?: string }
  webLink?: string
}

const person = (p?: GPerson): Person | null => (p?.emailAddress?.address ? { name: p.emailAddress.name || p.emailAddress.address, address: p.emailAddress.address } : null)

export function toItem(m: GMessage): MailItem {
  return {
    id: m.id,
    subject: m.subject?.trim() || '(no subject)',
    from: person(m.from),
    at: m.receivedDateTime ?? '',
    preview: (m.bodyPreview ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
    read: Boolean(m.isRead),
    attachments: Boolean(m.hasAttachments),
    flagged: m.flag?.flagStatus === 'flagged',
    conversation: m.conversationId,
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function toMessage(m: GMessage): MailMessage {
  const raw = m.body?.content ?? ''
  const html = m.body?.contentType === 'text' ? `<pre style="white-space:pre-wrap;font:inherit">${escapeHtml(raw)}</pre>` : raw
  return {
    ...toItem(m),
    to: (m.toRecipients ?? []).map(person).filter((p): p is Person => Boolean(p)),
    cc: (m.ccRecipients ?? []).map(person).filter((p): p is Person => Boolean(p)),
    html,
    webLink: typeof m.webLink === 'string' && m.webLink.startsWith('https://') ? m.webLink : undefined,
  }
}

/** "Ana <ana@x.com>, bob@y.com" into Graph recipients; anything that is not an address is refused. */
export function recipients(text: string) {
  const parts = text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.map((p) => {
    const m = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(p)
    const address = (m ? m[1] : p).trim()
    if (!/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(address)) throw new Error(`Not an email address: ${p}`)
    return { emailAddress: { address } }
  })
}

/** Message ids Graph hands out: url-safe base64 with = and - and _; anything else is refused. */
export const safeId = (id: unknown): string => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9=_\-+/]{8,400}$/.test(id)) throw new Error('Not a message id.')
  return encodeURIComponent(id)
}

/** What to paste in the app registration's redirect URIs (Mobile and desktop applications). */
export const OUTLOOK_REDIRECT = redirectFor('outlook', 'localhost')

/** Events between two instants, every occurrence expanded by Graph, times in UTC. */
export const calendarUrl = (from: Date, to: Date) =>
  `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(from.toISOString())}&endDateTime=${encodeURIComponent(to.toISOString())}&$top=200&$select=id,subject,start,end,isAllDay,location,onlineMeeting,isCancelled,bodyPreview`

type OEvent = { id: string; subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; isAllDay?: boolean; isCancelled?: boolean; location?: { displayName?: string }; onlineMeeting?: { joinUrl?: string } | null; bodyPreview?: string }

export function outlookEvents(items: OEvent[], calendar = 'Outlook'): Event[] {
  // with Prefer: outlook.timezone="UTC" the times come without a zone mark, in UTC
  const utc = (s?: string) => new Date(s && !/[zZ]|[+-]\d\d:\d\d$/.test(s) ? `${s}Z` : (s ?? ''))
  return items
    .filter((e) => !e.isCancelled && e.start?.dateTime)
    .map((e) => {
      const start = utc(e.start!.dateTime)
      const end = utc(e.end?.dateTime ?? e.start!.dateTime)
      // all-day events are midnight to midnight in the calendar's zone: shown on their date
      const day = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      return {
        id: `o-${e.id}`,
        title: e.subject?.trim() || '(no title)',
        start: (e.isAllDay ? day(start) : start).toISOString(),
        end: (e.isAllDay ? day(end) : end).toISOString(),
        allDay: Boolean(e.isAllDay),
        where: e.location?.displayName || undefined,
        join: e.onlineMeeting?.joinUrl ?? joinLink(e.location?.displayName, e.bodyPreview),
        calendar,
      }
    })
}
