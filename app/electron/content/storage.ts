// Where finished media goes so networks can fetch it: any S3-compatible bucket. Cloudflare R2, AWS S3,
// Backblaze B2, DigitalOcean Spaces, Wasabi and MinIO all speak the same API, so one signed PUT
// covers them; the person picks theirs. Keys live in the vault; the bucket settings are not secret.
import { createHash, createHmac } from 'node:crypto'

export type ProviderId = 'r2' | 's3' | 'b2' | 'spaces' | 'wasabi' | 'custom'
export type StorageConfig = { provider: ProviderId; bucket: string; region: string; accountId?: string; endpoint?: string; publicBase: string; prefix: string }
export type StorageKeys = { accessKeyId: string; secretAccessKey: string }

export const PROVIDERS: Record<ProviderId, { name: string; needs: ('region' | 'accountId' | 'endpoint')[]; hint: string; keysAt: string }> = {
  r2: { name: 'Cloudflare R2', needs: ['accountId'], hint: 'Public link: your custom domain on the bucket, or its r2.dev address while developing.', keysAt: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens' },
  s3: { name: 'AWS S3', needs: ['region'], hint: 'Public link: a CloudFront domain, or the bucket address if objects are public.', keysAt: 'https://console.aws.amazon.com/iam/home#/security_credentials' },
  b2: { name: 'Backblaze B2', needs: ['region'], hint: 'Region is like us-west-004. Public link: the bucket’s friendly URL or your CDN.', keysAt: 'https://secure.backblaze.com/app_keys.htm' },
  spaces: { name: 'DigitalOcean Spaces', needs: ['region'], hint: 'Region is like nyc3. Public link: the Space’s CDN endpoint.', keysAt: 'https://cloud.digitalocean.com/account/api/spaces' },
  wasabi: { name: 'Wasabi', needs: ['region'], hint: 'Region is like us-east-1. Public link: your CDN in front of the bucket.', keysAt: 'https://console.wasabisys.com/access_keys' },
  custom: { name: 'Other S3-compatible (MinIO...)', needs: ['endpoint', 'region'], hint: 'Endpoint like https://minio.example.com; path-style requests.', keysAt: 'https://min.io/docs/minio/linux/administration/identity-access-management.html' },
}

/** The endpoint and the URL of an object, for each provider. AWS uses virtual-hosted style; the rest path-style. */
export function objectUrl(c: StorageConfig, key: string): string {
  const k = key.split('/').map(encodeURIComponent).join('/')
  switch (c.provider) {
    case 'r2':
      return `https://${c.accountId}.r2.cloudflarestorage.com/${c.bucket}/${k}`
    case 's3':
      return `https://${c.bucket}.s3.${c.region}.amazonaws.com/${k}`
    case 'b2':
      return `https://s3.${c.region}.backblazeb2.com/${c.bucket}/${k}`
    case 'spaces':
      return `https://${c.region}.digitaloceanspaces.com/${c.bucket}/${k}`
    case 'wasabi':
      return `https://s3.${c.region}.wasabisys.com/${c.bucket}/${k}`
    default:
      return `${(c.endpoint ?? '').replace(/\/$/, '')}/${c.bucket}/${k}`
  }
}

export const publicUrl = (c: StorageConfig, key: string) => `${c.publicBase.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s).digest()

/** AWS Signature Version 4 headers for a PUT of `body` to `url`. */
export function signPut(url: string, body: Buffer, contentType: string, region: string, keys: StorageKeys, now = new Date()) {
  const u = new URL(url)
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const hash = sha(body)
  const headers: Record<string, string> = { host: u.host, 'content-type': contentType, 'x-amz-content-sha256': hash, 'x-amz-date': amzDate }
  const names = Object.keys(headers).sort()
  const canonical = ['PUT', u.pathname, '', names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), hash].join('\n')
  const scope = `${day}/${region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n')
  const kDate = hmac(`AWS4${keys.secretAccessKey}`, day)
  const kSigning = hmac(hmac(hmac(kDate, region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(toSign).digest('hex')
  return {
    'Content-Type': contentType,
    'x-amz-content-sha256': hash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${keys.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  }
}

export const signingRegion = (c: StorageConfig) => (c.provider === 'r2' ? 'auto' : c.region || 'us-east-1')

export const typeOf = (name: string) =>
  ({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'

export function keyFor(c: StorageConfig, file: string, now = new Date()) {
  const base = file.split('/').pop()!.replace(/[^\w.-]+/g, '_')
  return [c.prefix.replace(/^\/|\/$/g, ''), now.toISOString().slice(0, 7), base].filter(Boolean).join('/')
}

export function cleanConfig(c: Partial<StorageConfig>): StorageConfig {
  const provider = (Object.keys(PROVIDERS) as ProviderId[]).includes(c.provider as ProviderId) ? (c.provider as ProviderId) : 'r2'
  const base = String(c.publicBase ?? '').trim()
  if (base && !/^https:\/\//.test(base)) throw new Error('The public link must start with https:// (networks only fetch media over https).')
  return {
    provider,
    bucket: String(c.bucket ?? '').trim(),
    region: String(c.region ?? '').trim(),
    accountId: c.accountId ? String(c.accountId).trim() : undefined,
    endpoint: c.endpoint ? String(c.endpoint).trim() : undefined,
    publicBase: base,
    prefix: String(c.prefix ?? 'content').trim(),
  }
}

/** Uploads a file and returns its public link. */
export async function upload(c: StorageConfig, keys: StorageKeys, file: string, body: Buffer, doFetch: typeof fetch = fetch, now = new Date()): Promise<string> {
  if (!c.bucket || !c.publicBase) throw new Error('Set the bucket and its public link in Storage first.')
  const key = keyFor(c, file, now)
  const url = objectUrl(c, key)
  const r = await doFetch(url, { method: 'PUT', headers: signPut(url, body, typeOf(file), signingRegion(c), keys, now), body: new Uint8Array(body) })
  if (!r.ok) {
    const text = (await r.text()).slice(0, 400)
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1]
    const msg = /<Message>([^<]+)<\/Message>/.exec(text)?.[1]
    throw new Error(`${new URL(url).host} answered ${r.status}${code ? `: ${code}` : ''}${msg ? ` (${msg})` : ''}`)
  }
  return publicUrl(c, key)
}
