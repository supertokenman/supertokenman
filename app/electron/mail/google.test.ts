import { describe, expect, it } from 'vitest'
import { outlookEvents } from './outlook'
import { gmailItem, gmailListUrl, gmailMessage, googleEvents, people, rawMail } from './google'
import { mailService } from './service'

const b64u = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('gmail mapping', () => {
  it('maps folders to labels and archive to a search', () => {
    expect(gmailListUrl('inbox')).toContain('labelIds=INBOX')
    expect(decodeURIComponent(gmailListUrl('archive'))).toContain('q=-in:inbox')
    expect(gmailListUrl('deleteditems')).toContain('includeSpamTrash=true')
    expect(decodeURIComponent(gmailListUrl('inbox', 'from:ana'))).toContain('q=from:ana')
  })
  it('reads people, the unread and starred labels, and the html part of a nested multipart', () => {
    expect(people('"Ana Souza" <ana@x.com>, bob@y.com')).toEqual([{ name: 'Ana Souza', address: 'ana@x.com' }, { name: 'bob@y.com', address: 'bob@y.com' }])
    const m = { id: 'abc123', threadId: 't1', labelIds: ['UNREAD', 'STARRED', 'INBOX'], snippet: 'Oi &amp; tchau', internalDate: '1761249000000', payload: { headers: [{ name: 'From', value: 'Ana <ana@x.com>' }, { name: 'Subject', value: 'Oi' }, { name: 'To', value: 'me@x.com' }], mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64u('plain') } }, { mimeType: 'text/html', body: { data: b64u('<b>rich</b>') } }] }, { mimeType: 'application/pdf', filename: 'a.pdf', body: {} }] } }
    const it = gmailItem(m)
    expect(it).toMatchObject({ subject: 'Oi', read: false, flagged: true, attachments: true, preview: 'Oi & tchau', from: { address: 'ana@x.com' } })
    expect(gmailMessage(m).html).toBe('<b>rich</b>')
  })
  it('writes a raw reply that keeps the thread and cannot be given extra headers', () => {
    const raw = Buffer.from(rawMail({ to: ['ana@x.com'], subject: 'Re: Olá\nBcc: evil@x.com', text: 'Valeu', inReplyTo: '<m1@x>' }).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    expect(raw).toContain('Subject: =?UTF-8?B?')
    expect(raw).not.toMatch(/^Bcc:/m)
    expect(raw).toContain('In-Reply-To: <m1@x>')
    expect(Buffer.from(raw.split('\r\n\r\n')[1]!.replace(/\r\n/g, ''), 'base64').toString()).toBe('Valeu')
  })
})

describe('calendars', () => {
  it('reads Google events with their meeting link, skipping cancelled ones', () => {
    const ev = googleEvents([{ id: 'e1', summary: 'Daily', start: { dateTime: '2026-10-24T12:00:00Z' }, end: { dateTime: '2026-10-24T12:15:00Z' }, hangoutLink: 'https://meet.google.com/abc-defg-hij' }, { id: 'e2', status: 'cancelled', start: { date: '2026-10-24' } }, { id: 'e3', summary: 'Feriado', start: { date: '2026-10-25' }, end: { date: '2026-10-26' } }])
    expect(ev).toHaveLength(2)
    expect(ev[0]).toMatchObject({ title: 'Daily', join: 'https://meet.google.com/abc-defg-hij', allDay: false, start: '2026-10-24T12:00:00.000Z' })
    expect(ev[1]?.allDay).toBe(true)
  })
  it('reads Outlook events in UTC with their Teams link', () => {
    const ev = outlookEvents([{ id: 'o1', subject: 'Review', start: { dateTime: '2026-10-24T15:00:00.0000000' }, end: { dateTime: '2026-10-24T15:30:00.0000000' }, onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' } }, { id: 'o2', isCancelled: true, start: { dateTime: '2026-10-24T16:00:00' } }])
    expect(ev).toEqual([expect.objectContaining({ title: 'Review', start: '2026-10-24T15:00:00.000Z', join: 'https://teams.microsoft.com/l/meetup-join/x' })])
  })
  it('shows the calendars that work and says why one does not', async () => {
    const v = new Map([['MAIL_OUTLOOK', JSON.stringify({ accessToken: 'a_token_123456789', expiresAt: Date.now() + 3600e3 })], ['MAIL_GMAIL', JSON.stringify({ accessToken: 'g_token_123456789', expiresAt: Date.now() + 3600e3 })]])
    const fetch = (async (url: string) => (url.includes('calendarView') ? new Response('{"error":{"message":"denied"}}', { status: 403 }) : new Response(JSON.stringify({ items: [{ id: 'e1', summary: 'Daily', start: { dateTime: '2026-10-24T12:00:00Z' } }] })))) as unknown as typeof globalThis.fetch
    const s = mailService({ vault: { get: (n) => v.get(n), set: () => undefined, delete: () => undefined }, guard: () => undefined, openLogin: () => undefined, fetch })
    const r = await s.events(new Date('2026-10-24'), new Date('2026-10-25'))
    expect(r.events.map((e) => e.title)).toEqual(['Daily'])
    expect(r.errors).toEqual([{ calendar: 'Outlook', error: 'Connect Outlook again to allow its calendar.' }])
  })
})
