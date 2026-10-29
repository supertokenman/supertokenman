import { describe, expect, it } from 'vitest'
import { makeFetcher } from './core'
import { NETWORKS, metaIds, xAuth } from './networks'
import { authorizeUrl, refreshed, redirectFor } from './oauth'
import { cleanItem, dueNetworks, problem, stateOf } from './queue'
import { credName, readCred, secretsOf, writeCred } from './store'

/** A fetch that answers from a table of URL fragments, and records what was asked. */
function fake(table: [string, unknown, number?][]) {
  const calls: { url: string; method: string; body?: string; headers: Record<string, string> }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined, headers: (init?.headers ?? {}) as Record<string, string> })
    const hit = table.find(([k]) => url.includes(k))
    const [, body, status = 200] = hit ?? ['', { error: { message: 'no route' } }, 404]
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { f, calls }
}

describe('fetcher', () => {
  it('turns API errors into a sentence and masks secrets', async () => {
    const { f } = fake([['graph', { error: { message: 'Invalid token EAAsecret123' } }, 400]])
    await expect(makeFetcher(f, () => ['EAAsecret123'])('https://graph.facebook.com/v21.0/me')).rejects.toThrow('graph.facebook.com answered 400: Invalid token ***')
  })
})

describe('instagram', () => {
  it('reads the profile and posts, and publishes in two steps', async () => {
    const { f, calls } = fake([
      ['/media_publish', { id: 'P1' }],
      ['/P1?', { permalink: 'https://instagram.com/p/x' }],
      ['/17841/media?fields', { data: [{ id: 'm1', caption: 'oi', timestamp: '2026-10-01T10:00:00Z', like_count: 3, comments_count: 1 }] }],
      ['/17841/media?', { id: 'C1' }],
      ['/17841?', { username: 'bia', followers_count: 120, media_count: 9 }],
    ])
    const c = { accessToken: 'T', ids: { igUser: '17841' } }
    const fx = makeFetcher(f)
    expect(await NETWORKS.instagram.profile(c, fx)).toMatchObject({ handle: '@bia', followers: 120 })
    expect(await NETWORKS.instagram.posts(c, fx)).toEqual([expect.objectContaining({ id: 'm1', likes: 3, comments: 1 })])
    expect(await NETWORKS.instagram.publish!(c, fx, { text: 'hello', mediaUrl: 'https://x.dev/a.jpg', mediaKind: 'image' })).toEqual({ id: 'P1', url: 'https://instagram.com/p/x' })
    expect(calls.some((x) => x.url.includes('image_url=https%3A%2F%2Fx.dev%2Fa.jpg') && x.method === 'POST')).toBe(true)
    await expect(NETWORKS.instagram.publish!(c, fx, { text: 'no media' })).rejects.toThrow(/photo or a video/)
  })
  it('finds the Page and the Instagram account from a user token', async () => {
    const { f } = fake([['/me/accounts', { data: [{ id: 'PG', name: 'Bia', access_token: 'PT', instagram_business_account: { id: 'IG' } }] }]])
    expect(await metaIds(makeFetcher(f), 'U')).toEqual({ page: 'PG', pageToken: 'PT', igUser: 'IG', pageName: 'Bia' })
  })
})

describe('x and linkedin', () => {
  it('posts with a bearer token and JSON', async () => {
    const { f, calls } = fake([['/2/tweets', { data: { id: '99' } }]])
    expect(await NETWORKS.x.publish!({ accessToken: 'XT' }, makeFetcher(f), { text: 'hi', link: 'https://a.dev' })).toEqual({ id: '99', url: 'https://x.com/i/web/status/99' })
    expect(calls[0]).toMatchObject({ method: 'POST', body: JSON.stringify({ text: 'hi https://a.dev' }) })
    expect(calls[0]!.headers.Authorization).toBe('Bearer XT')
  })
  it('posts to LinkedIn as the person, with the API version header', async () => {
    const { f, calls } = fake([['/rest/posts', {}]])
    await NETWORKS.linkedin.publish!({ accessToken: 'L', ids: { person: 'abc' } }, makeFetcher(f), { text: 'news' })
    expect(JSON.parse(calls[0]!.body!).author).toBe('urn:li:person:abc')
    expect(calls[0]!.headers['LinkedIn-Version']).toMatch(/^\d{6}$/)
  })
})

describe('oauth', () => {
  it('builds a PKCE authorize URL to the loopback address', () => {
    const u = new URL(authorizeUrl({ authorize: 'https://x.com/i/oauth2/authorize', token: '', scopes: ['a', 'b'], clientAuth: 'basic' }, 'x', 'CID', { challenge: 'CH', state: 'ST' }))
    expect(u.searchParams.get('redirect_uri')).toBe(redirectFor('x'))
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('scope')).toBe('a b')
    expect(redirectFor('x')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback\/x$/)
  })
  it('refreshes only when the token is about to expire', async () => {
    const { f } = fake([['token', { access_token: 'NEW', expires_in: 3600 }]])
    const spec = { authorize: '', token: 'https://t/token', scopes: [], clientAuth: 'body' as const }
    const c = { accessToken: 'OLD', refreshToken: 'R', clientId: 'C', expiresAt: 1000 }
    expect((await refreshed(spec, makeFetcher(f), c, 1000))?.accessToken).toBe('NEW')
    expect(await refreshed(spec, makeFetcher(f), { ...c, expiresAt: 10_000_000 }, 1000)).toBeNull()
  })
})

describe('queue', () => {
  it('never goes out before approval, then once per network', () => {
    const i = cleanItem({ text: 'hi', networks: ['x', 'threads', 'x'], when: 5000 }, 0)
    expect(i.networks).toEqual(['x', 'threads'])
    expect(dueNetworks(i, 9999)).toEqual([])
    const ok = { ...i, approved: true }
    expect(dueNetworks(ok, 4000)).toEqual([])
    expect(dueNetworks(ok, 6000)).toEqual(['x', 'threads'])
    const half = { ...ok, results: { x: { ok: true, at: 6000 } } }
    expect(dueNetworks(half, 7000)).toEqual(['threads'])
    expect(stateOf(half, 7000)).toBe('partly')
    expect(dueNetworks({ ...ok, results: { x: { ok: false, at: 0, error: 'no' } } }, 10 ** 9)).toEqual(['threads'])
  })
  it('says what a draft lacks for each network', () => {
    const i = cleanItem({ text: 'x'.repeat(300), networks: ['x', 'instagram'] })
    expect(problem(i, 'x')).toMatch(/280/)
    expect(problem(i, 'instagram')).toMatch(/photo or video/)
    expect(cleanItem({ mediaUrl: 'http://insecure.dev/a.jpg' }).mediaUrl).toBeUndefined()
  })
})

describe('store', () => {
  it('keeps credentials in the vault, never for commands, and reads a bare pasted token', () => {
    const m = new Map<string, { v: string; cmd?: boolean }>()
    const v = { get: (n: string) => m.get(n)?.v, set: (n: string, val: string, cmd?: boolean) => void m.set(n, { v: val, cmd }), delete: (n: string) => void m.delete(n) }
    writeCred(v, 'x', { accessToken: 'A', refreshToken: 'R' })
    expect(m.get('SOCIAL_X')).toMatchObject({ cmd: false })
    expect(readCred(v, 'x')).toEqual({ accessToken: 'A', refreshToken: 'R' })
    m.set(credName('threads'), { v: ' THR ' })
    expect(readCred(v, 'threads')).toEqual({ accessToken: 'THR' })
    expect(secretsOf({ accessToken: 'A', clientSecret: 'S', ids: { pageToken: 'P' } })).toEqual(['A', 'S', 'P'])
  })
  it('keeps X as one connection: four pasted keys sign with OAuth 1.0a, a sign-in token as Bearer', () => {
    const m = new Map<string, { v: string }>()
    const v = { get: (n: string) => m.get(n)?.v, set: (n: string, val: string) => void m.set(n, { v: val }), delete: (n: string) => void m.delete(n) }
    const keys = { consumerKey: 'ck', consumerSecret: 'cs', token: 't', tokenSecret: 'ts' }
    writeCred(v, 'x', { accessToken: '', keys })
    const c = readCred(v, 'x')!
    expect(c.keys).toEqual(keys)
    expect(secretsOf(c)).toEqual(['ck', 'cs', 't', 'ts'])
    expect(xAuth(c, 'POST', 'https://api.x.com/2/tweets')).toMatch(/^OAuth oauth_consumer_key="ck".*oauth_signature="/)
    expect(xAuth({ accessToken: 'B' }, 'GET', 'https://api.x.com/2/users/me')).toBe('Bearer B')
  })
})
