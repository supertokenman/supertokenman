// OAuth 2 with PKCE through a loopback address: the network's own login page opens in the app's
// setup window, the browser comes back to 127.0.0.1 on this Mac, and the code becomes tokens here.
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { Cred, Fetcher } from './core.js'
import { qs } from './core.js'

export type OAuthSpec = {
  authorize: string
  token: string
  scopes: string[]
  /** extra parameters on the authorize URL */
  extra?: Record<string, string>
  /** how the token endpoint wants the client: in the body, or as basic auth */
  clientAuth: 'body' | 'basic'
  /** TikTok calls the client id client_key */
  clientIdParam?: string
  scopeSep?: string
  /** the host in the redirect URL: Microsoft's portal registers http://localhost, not 127.0.0.1 */
  host?: 'localhost'
}

export const PORT = 53682
export const redirectFor = (network: string, host: string = '127.0.0.1') => `http://${host}:${PORT}/callback/${network}`

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function pkce() {
  const verifier = b64url(randomBytes(48))
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()), state: b64url(randomBytes(16)) }
}

export function authorizeUrl(spec: OAuthSpec, network: string, clientId: string, p: { challenge: string; state: string }) {
  return `${spec.authorize}?${qs({
    response_type: 'code',
    [spec.clientIdParam ?? 'client_id']: clientId,
    redirect_uri: redirectFor(network, spec.host),
    scope: spec.scopes.join(spec.scopeSep ?? ' '),
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    ...spec.extra,
  })}`
}

type TokenAnswer = { access_token?: string; refresh_token?: string; expires_in?: number }

async function tokenCall(spec: OAuthSpec, f: Fetcher, clientId: string, clientSecret: string | undefined, params: Record<string, string>): Promise<TokenAnswer> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  const body: Record<string, string> = { ...params }
  if (spec.clientAuth === 'basic' && clientSecret) headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  else {
    body[spec.clientIdParam ?? 'client_id'] = clientId
    if (clientSecret) body.client_secret = clientSecret
  }
  return (await f(spec.token, { method: 'POST', headers, body: qs(body) })) as TokenAnswer
}

export async function exchange(spec: OAuthSpec, f: Fetcher, network: string, clientId: string, clientSecret: string | undefined, code: string, verifier: string): Promise<Cred> {
  const t = await tokenCall(spec, f, clientId, clientSecret, { grant_type: 'authorization_code', code, redirect_uri: redirectFor(network, spec.host), code_verifier: verifier })
  if (!t.access_token) throw new Error('The network did not return an access token.')
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : undefined, clientId, clientSecret }
}

/** A fresh access token when the saved one is about to expire; the same cred otherwise. */
export async function refreshed(spec: OAuthSpec | undefined, f: Fetcher, c: Cred, now = Date.now()): Promise<Cred | null> {
  if (!spec || !c.refreshToken || !c.clientId || !c.expiresAt || c.expiresAt - now > 120_000) return null
  const t = await tokenCall(spec, f, c.clientId, c.clientSecret, { grant_type: 'refresh_token', refresh_token: c.refreshToken })
  if (!t.access_token) return null
  return { ...c, accessToken: t.access_token, refreshToken: t.refresh_token ?? c.refreshToken, expiresAt: t.expires_in ? now + t.expires_in * 1000 : undefined }
}

/**
 * Waits for the browser to come back with ?code; it listens only on this Mac's loopback (IPv4, and
 * IPv6 too when the redirect says localhost) and only for 5 minutes.
 */
export function waitForCode(network: string, state: string, timeoutMs = 300_000, host?: 'localhost'): Promise<string> {
  return new Promise((resolve, reject) => {
    const servers: ReturnType<typeof createServer>[] = []
    const closeAll = () => servers.forEach((x) => x.close())
    const handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      const u = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
      if (u.pathname !== `/callback/${network}`) {
        res.writeHead(404).end()
        return
      }
      const code = u.searchParams.get('code')
      const ok = code && u.searchParams.get('state') === state
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;background:#141413;color:#ecebe6;display:grid;place-items:center;height:100vh;margin:0"><div>${ok ? 'Connected. You can close this window.' : 'That did not work. Close this window and try again.'}</div>`)
      closeAll()
      clearTimeout(timer)
      if (ok) resolve(code!)
      else reject(new Error(u.searchParams.get('error_description') ?? u.searchParams.get('error') ?? 'The login came back without a code.'))
    }
    const timer = setTimeout(() => {
      closeAll()
      reject(new Error('The login took longer than 5 minutes.'))
    }, timeoutMs)
    for (const addr of host === 'localhost' ? ['127.0.0.1', '::1'] : ['127.0.0.1']) {
      const server = createServer(handler)
      servers.push(server)
      // a Mac without IPv6 on loopback still has IPv4
      server.on('error', (e) => (addr === '127.0.0.1' ? reject(e) : undefined))
      server.listen(PORT, addr)
    }
  })
}
