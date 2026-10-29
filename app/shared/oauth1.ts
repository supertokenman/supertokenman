// OAuth 1.0a (RFC 5849) HMAC-SHA1 signing, as X's API v2 user context takes it. Pure: the HMAC comes in.

export type Keys = { consumerKey: string; consumerSecret: string; token: string; tokenSecret: string }
/** base64 of HMAC-SHA1(key, text) */
export type Hmac = (key: string, text: string) => string

/** RFC 3986 percent-encoding, as RFC 5849 3.6 asks. */
export const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export function baseString(method: string, url: string, params: Record<string, string>): string {
  const u = new URL(url)
  const all: [string, string][] = [...u.searchParams.entries(), ...Object.entries(params)]
  const norm = all.map(([k, v]) => [enc(k), enc(v)] as const).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&')
  return [method.toUpperCase(), enc(`${u.protocol}//${u.host}${u.pathname}`), enc(norm)].join('&')
}

/** The Authorization header. `form` holds url-encoded body params (none for a JSON body, as on /2/tweets). */
export function authHeader(method: string, url: string, k: Keys, hmac: Hmac, o: { nonce: string; timestamp: number; form?: Record<string, string> }): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: k.consumerKey,
    oauth_nonce: o.nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(o.timestamp),
    oauth_token: k.token,
    oauth_version: '1.0',
  }
  const sig = hmac(`${enc(k.consumerSecret)}&${enc(k.tokenSecret)}`, baseString(method, url, { ...oauth, ...o.form }))
  return 'OAuth ' + Object.entries({ ...oauth, oauth_signature: sig }).sort(([a], [b]) => (a < b ? -1 : 1)).map(([a, b]) => `${enc(a)}="${enc(b)}"`).join(', ')
}
