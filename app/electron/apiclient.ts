// The API client's sending end, in the main process: {{NAME}} placeholders are filled from the vault
// here, so a secret's value never reaches the window, and any value of the vault that comes back in the
// answer is masked before it does.
export type ApiRequest = { id: string; name: string; method: string; url: string; headers: { key: string; value: string; on: boolean }[]; body: string }
export type ApiResponse = { status: number; statusText: string; ms: number; size: number; headers: [string, string][]; body: string; used: string[]; error?: string }

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const MAX_BODY = 2_000_000

/** Fills {{NAME}} from the vault; returns the names used and the ones that are missing. */
export function fill(text: string, secret: (name: string) => string | undefined, used: Set<string>, missing: Set<string>) {
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, name: string) => {
    const v = secret(name)
    if (v === undefined) {
      missing.add(name)
      return m
    }
    used.add(name)
    return v
  })
}

/** Every vault value in a text, masked. Short values are left alone: they would mask ordinary words. */
export function mask(text: string, values: string[]) {
  let out = text
  for (const v of values.filter((x) => x.length >= 6).sort((a, b) => b.length - a.length)) out = out.split(v).join('••••••')
  return out
}

export async function sendRequest(req: ApiRequest, vault: { get: (n: string) => string | undefined; all: () => { value: string }[] }, doFetch: typeof fetch = fetch): Promise<ApiResponse> {
  const used = new Set<string>()
  const missing = new Set<string>()
  const method = METHODS.includes(req.method.toUpperCase()) ? req.method.toUpperCase() : 'GET'
  const url = fill(req.url.trim(), vault.get, used, missing)
  const headers: Record<string, string> = {}
  for (const h of req.headers) if (h.on && h.key.trim()) headers[h.key.trim()] = fill(h.value, vault.get, used, missing)
  const body = method === 'GET' || method === 'HEAD' ? undefined : fill(req.body, vault.get, used, missing) || undefined
  const empty = (error: string): ApiResponse => ({ status: 0, statusText: '', ms: 0, size: 0, headers: [], body: '', used: [...used], error })
  if (missing.size) return empty(`Not in the vault: ${[...missing].join(', ')}. Add ${missing.size === 1 ? 'it' : 'them'} in Connections, Vault.`)
  if (!/^https?:\/\//i.test(url)) return empty('The address has to start with http:// or https://')
  if (body && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type') && /^\s*[[{]/.test(body)) headers['Content-Type'] = 'application/json'
  const t0 = Date.now()
  try {
    const r = await doFetch(url, { method, headers, body, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
    const buf = Buffer.from(await r.arrayBuffer())
    const values = vault.all().map((x) => x.value)
    const text = buf.subarray(0, MAX_BODY).toString('utf8')
    return {
      status: r.status,
      statusText: r.statusText,
      ms: Date.now() - t0,
      size: buf.length,
      headers: (() => {
        const hs: [string, string][] = []
        r.headers.forEach((v, k) => hs.push([k, mask(v, values)]))
        return hs
      })(),
      body: mask(text, values) + (buf.length > MAX_BODY ? '\n… (cut at 2 MB)' : ''),
      used: [...used],
    }
  } catch (e) {
    return { ...empty(e instanceof Error ? (e.name === 'TimeoutError' ? 'No answer in 30 seconds.' : e.message) : String(e)), ms: Date.now() - t0 }
  }
}
