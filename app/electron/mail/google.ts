// Gmail and Google Calendar through Google's APIs, mapped to the same shapes as Outlook so one mail
// screen and one agenda show both. Sign-in is Google's own page (OAuth with PKCE, a Desktop app
// client the person creates); tokens live in the vault and are used only in the main process.
import type { Event } from '../calendar.js'
import { joinLink } from '../calendar.js'
import type { OAuthSpec } from '../social/oauth.js'
import type { Folder, MailItem, MailMessage, Person } from './outlook.js'

export const GMAIL = process.env.STM_GMAIL_API ?? 'https://gmail.googleapis.com/gmail/v1/users/me'
export const GCAL = process.env.STM_GCAL_API ?? 'https://www.googleapis.com/calendar/v3'

export const GOOGLE: OAuthSpec = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/calendar.readonly'],
  extra: { access_type: 'offline', prompt: 'consent' },
  clientAuth: 'body',
}

/** The app's folders as Gmail labels or searches. */
export function gmailListUrl(folder: Folder, search?: string, max = 30, pageToken?: string) {
  const q = search?.trim()
  const p = new URLSearchParams({ maxResults: String(max) })
  if (pageToken) p.set('pageToken', pageToken)
  if (q) p.set('q', q.slice(0, 200))
  else if (folder === 'archive') p.set('q', '-in:inbox -in:sent -in:drafts -in:spam -in:trash -in:chats')
  else p.set('labelIds', { inbox: 'INBOX', sentitems: 'SENT', drafts: 'DRAFT', junkemail: 'SPAM', deleteditems: 'TRASH' }[folder])
  if (folder === 'junkemail' || folder === 'deleteditems') p.set('includeSpamTrash', 'true')
  return `${GMAIL}/messages?${p}`
}

type Header = { name: string; value: string }
type Part = { mimeType?: string; body?: { data?: string; size?: number }; parts?: Part[]; filename?: string; headers?: Header[] }
export type GMsg = { id: string; threadId?: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part }

const header = (m: GMsg, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

/** "Ana Souza <ana@x.com>, bob@y.com" as people. */
export function people(v: string): Person[] {
  const out: Person[] = []
  for (const m of v.matchAll(/(?:"?([^",<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>|([^\s,<>"]+@[^\s,<>"]+))/g)) {
    const address = (m[2] ?? m[3] ?? '').trim()
    if (address) out.push({ name: (m[1] ?? '').trim() || address, address })
  }
  return out
}

const decodeHtmlEntities = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export function gmailItem(m: GMsg): MailItem {
  const labels = m.labelIds ?? []
  const walk = (p?: Part): boolean => Boolean(p && ((p.filename && p.filename.length > 0) || p.parts?.some(walk)))
  return {
    id: m.id,
    subject: header(m, 'Subject').trim() || '(no subject)',
    from: people(header(m, 'From'))[0] ?? null,
    at: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : '',
    preview: decodeHtmlEntities(m.snippet ?? '').slice(0, 240),
    read: !labels.includes('UNREAD'),
    attachments: walk(m.payload),
    flagged: labels.includes('STARRED'),
    conversation: m.threadId,
  }
}

const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
/** The HTML body, or the plain one shown as text; nested multiparts searched in order. */
function bodyOf(p?: Part): { html?: string; text?: string } {
  if (!p) return {}
  if (p.mimeType === 'text/html' && p.body?.data) return { html: b64(p.body.data) }
  if (p.mimeType === 'text/plain' && p.body?.data && !p.filename) return { text: b64(p.body.data) }
  let found: { html?: string; text?: string } = {}
  for (const c of p.parts ?? []) {
    const b = bodyOf(c)
    if (b.html) return b
    if (b.text && !found.text) found = b
  }
  return found
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function gmailMessage(m: GMsg): MailMessage {
  const b = bodyOf(m.payload)
  return {
    ...gmailItem(m),
    to: people(header(m, 'To')),
    cc: people(header(m, 'Cc')),
    html: b.html ?? `<pre style="white-space:pre-wrap;font:inherit">${esc(b.text ?? '')}</pre>`,
    webLink: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(m.threadId ?? m.id)}`,
  }
}

/** Headers a reply needs, read from the original. */
export const replyHeaders = (m: GMsg) => ({ messageId: header(m, 'Message-ID') || header(m, 'Message-Id'), references: header(m, 'References'), replyTo: header(m, 'Reply-To'), from: header(m, 'From'), to: header(m, 'To'), cc: header(m, 'Cc'), subject: header(m, 'Subject') })

const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`)
const noBreaks = (s: string) => s.replace(/[\r\n]+/g, ' ')

/** A plain-text email as Gmail's raw field (RFC 2822, base64url). Header values never carry line breaks. */
export function rawMail(m: { to: string[]; cc?: string[]; subject: string; text: string; inReplyTo?: string; references?: string }) {
  const lines = [
    `To: ${noBreaks(m.to.join(', '))}`,
    ...(m.cc?.length ? [`Cc: ${noBreaks(m.cc.join(', '))}`] : []),
    `Subject: ${encWord(noBreaks(m.subject))}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${noBreaks(m.inReplyTo)}`, `References: ${noBreaks(`${m.references ?? ''} ${m.inReplyTo}`.trim())}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(m.text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n'),
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

type GEvent = { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string; hangoutLink?: string; description?: string; status?: string; conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] } }

export function googleEvents(items: GEvent[], calendar = 'Google'): Event[] {
  return items
    .filter((e) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date))
    .map((e) => {
      const allDay = !e.start?.dateTime
      const start = allDay ? new Date(`${e.start!.date}T00:00:00`) : new Date(e.start!.dateTime!)
      const end = allDay ? new Date(`${e.end?.date ?? e.start!.date}T00:00:00`) : new Date(e.end?.dateTime ?? e.start!.dateTime!)
      const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri
      return { id: `g-${e.id}`, title: e.summary?.trim() || '(no title)', start: start.toISOString(), end: end.toISOString(), allDay, where: e.location, join: e.hangoutLink ?? video ?? joinLink(e.location, e.description), calendar }
    })
}

export const safeGid = (id: unknown): string => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error('Not a message id.')
  return id
}
