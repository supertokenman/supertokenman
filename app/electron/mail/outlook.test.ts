import { describe, expect, it } from 'vitest'
import { GRAPH, listUrl, recipients, safeId, safeNext, toItem, toMessage } from './outlook'
import { mailService, MAIL_KEY } from './service'

describe('outlook mapping', () => {
  it('lists a folder newest first, or searches the whole mailbox', () => {
    expect(listUrl('inbox')).toContain('/me/mailFolders/inbox/messages?$top=40&$orderby=receivedDateTime%20desc')
    expect(listUrl('inbox', 'invoice "march"')).toBe(`${GRAPH}/me/messages?$search=${encodeURIComponent('"invoice march"')}&$top=40&$select=id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,flag,conversationId`)
  })
  it('follows only Graph’s own next-page links', () => {
    expect(safeNext(`${GRAPH}/me/messages?$skip=40`)).toBe(`${GRAPH}/me/messages?$skip=40`)
    expect(safeNext('https://evil.example/steal')).toBeUndefined()
  })
  it('turns names and addresses into recipients and refuses the rest', () => {
    expect(recipients('Ana <ana@x.com>, bob@y.com')).toEqual([{ emailAddress: { address: 'ana@x.com' } }, { emailAddress: { address: 'bob@y.com' } }])
    expect(() => recipients('not an address')).toThrow('Not an email address')
  })
  it('accepts Graph message ids only', () => {
    expect(safeId('AAMkAGI2TG93AAA=')).toBe('AAMkAGI2TG93AAA%3D')
    expect(() => safeId('../me/sendMail')).toThrow()
  })
  it('maps a message, and shows plain text bodies escaped', () => {
    const m = toMessage({ id: 'AAMkAGI2TG93AAA=', subject: '', from: { emailAddress: { name: 'Ana', address: 'ana@x.com' } }, isRead: false, flag: { flagStatus: 'flagged' }, body: { contentType: 'text', content: '<b>hi</b>' }, webLink: 'javascript:alert(1)' })
    expect(m.subject).toBe('(no subject)')
    expect(m.flagged).toBe(true)
    expect(m.html).toContain('&lt;b&gt;hi&lt;/b&gt;')
    expect(m.webLink).toBeUndefined()
    expect(toItem({ id: 'x', bodyPreview: '  a \n b ' }).preview).toBe('a b')
  })
})

const vault = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { get: (n: string) => m.get(n), set: (n: string, v: string) => void m.set(n, v), delete: (n: string) => void m.delete(n), m }
}
const cred = (over = {}) => JSON.stringify({ accessToken: 'tok_secret_1234567890', refreshToken: 'ref_secret_1234567890', clientId: '1a2b3c4d-1111-2222-3333-444455556666', expiresAt: Date.now() + 3600_000, ...over })

describe('outlook service', () => {
  it('reads a page with the token and never says it in an error', async () => {
    const seen: { url: string; auth?: string }[] = []
    const fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: (init?.headers as Record<string, string>).Authorization })
      if (url.includes('/mailFolders/inbox/messages')) return new Response(JSON.stringify({ value: [{ id: 'AAMkAGI2TG93AAA=', subject: 'Hi', isRead: false }], '@odata.nextLink': `${GRAPH}/next` }))
      return new Response(JSON.stringify({ error: { message: 'bad tok_secret_1234567890' } }), { status: 403 })
    }) as unknown as typeof globalThis.fetch
    const s = mailService({ vault: vault({ [MAIL_KEY]: cred() }), guard: () => undefined, openLogin: () => undefined, fetch })
    const page = await s.list('outlook', 'inbox')
    expect(page.items[0]?.subject).toBe('Hi')
    expect(page.next).toBe(`${GRAPH}/next`)
    expect(seen[0]?.auth).toBe('Bearer tok_secret_1234567890')
    await expect(s.get('outlook', 'AAMkAGI2TG93AAA=')).rejects.toThrow(/answered 403: bad \*\*\*/)
  })
  it('refreshes an expiring token and keeps the new one in the vault', async () => {
    const v = vault({ [MAIL_KEY]: cred({ expiresAt: Date.now() + 10_000 }) })
    const fetch = (async (url: string) => {
      if (url.includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'new_access_123456', refresh_token: 'new_refresh_123456', expires_in: 3600 }))
      return new Response(JSON.stringify({ unreadItemCount: 7 }))
    }) as unknown as typeof globalThis.fetch
    const s = mailService({ vault: v, guard: () => undefined, openLogin: () => undefined, fetch })
    expect(await s.unread('outlook')).toBe(7)
    expect(JSON.parse(v.m.get(MAIL_KEY)!).accessToken).toBe('new_access_123456')
  })
  it('sends plain text to checked recipients and says plainly when signed out', async () => {
    let body = ''
    const fetch = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/me/sendMail')) {
        body = String(init?.body)
        return new Response('', { status: 202 })
      }
      return new Response('{}', { status: 401 })
    }) as unknown as typeof globalThis.fetch
    const s = mailService({ vault: vault({ [MAIL_KEY]: cred() }), guard: () => undefined, openLogin: () => undefined, fetch })
    await s.send('outlook', { to: 'Ana <ana@x.com>', subject: 'Oi', text: 'Tudo bem?' })
    expect(JSON.parse(body).message).toMatchObject({ subject: 'Oi', body: { contentType: 'Text', content: 'Tudo bem?' }, toRecipients: [{ emailAddress: { address: 'ana@x.com' } }] })
    await expect(s.unread('outlook')).rejects.toThrow('Outlook signed you out. Connect again.')
    expect(() => s.move('outlook', 'AAMkAGI2TG93AAA=', 'nowhere')).toThrow('Not a folder.')
  })
})
