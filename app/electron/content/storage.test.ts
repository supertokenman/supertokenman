import { describe, expect, it } from 'vitest'
import { cleanConfig, keyFor, objectUrl, publicUrl, signPut } from './storage'

const KEYS = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }

describe('S3-compatible storage', () => {
  it('signs exactly like AWS botocore (recorded vectors)', () => {
    const cases: [string, string, string, string][] = [
    ['https://mybucket.s3.sa-east-1.amazonaws.com/content/2026-10/reel.mp4', 'sa-east-1', '2026-10-23T17:10:41Z', 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261023/sa-east-1/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=0203b02cfc1d2fb2111ee632e00031342693040d552cb324760fac37bbde0e20'],
    ['https://acct123.r2.cloudflarestorage.com/media/content/2026-10/a%20b.mp4', 'auto', '2026-10-23T17:10:42Z', 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261023/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=dd14cbe26f3332d45e4bea85fec24bb27834d20b87a493e0a9ffd83ab0e68eb8'],
    ]
    for (const [url, region, at, auth] of cases) expect(signPut(url, Buffer.from('hello video'), 'video/mp4', region, KEYS, new Date(at)).Authorization).toBe(auth)
  })
  it('addresses each provider', () => {
    expect(objectUrl(cleanConfig({ provider: 'r2', accountId: 'acct123', bucket: 'media', publicBase: 'https://cdn.x.dev' }), 'content/a b.mp4')).toBe('https://acct123.r2.cloudflarestorage.com/media/content/a%20b.mp4')
    expect(objectUrl(cleanConfig({ provider: 's3', region: 'sa-east-1', bucket: 'mybucket', publicBase: 'https://d1.cloudfront.net' }), 'k.mp4')).toBe('https://mybucket.s3.sa-east-1.amazonaws.com/k.mp4')
    expect(objectUrl(cleanConfig({ provider: 'spaces', region: 'nyc3', bucket: 'b', publicBase: '' }), 'k')).toBe('https://nyc3.digitaloceanspaces.com/b/k')
    expect(publicUrl(cleanConfig({ provider: 'r2', publicBase: 'https://cdn.x.dev/' }), 'content/2026-10/a b.mp4')).toBe('https://cdn.x.dev/content/2026-10/a%20b.mp4')
  })
  it('keys by month under a prefix and refuses an http public link', () => {
    expect(keyFor(cleanConfig({ prefix: '/content/' }), '/x/My Reel.mp4', new Date('2026-10-23T00:00:00Z'))).toBe('content/2026-10/My_Reel.mp4')
    expect(() => cleanConfig({ publicBase: 'http://insecure.dev' })).toThrow(/https/)
  })
})
