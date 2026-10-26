import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { leakArgs, leaksOf, maskSecret, prePushHook, rotateUrl, steps, vaultNameFor } from './leaks'

const h = (s: string) => createHash('sha256').update(s).digest('hex')
const SECRET = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'
const line = (o: Record<string, unknown>) => JSON.stringify(o)
const OUT = [
  '{"level":"info","msg":"running source"}',
  line({ SourceMetadata: { Data: { Git: { commit: '9f1c2ab34de5f6a7', file: 'src/config.ts', email: 'Dev <dev@example.com>', timestamp: '2026-10-20 10:00:00 +0000', line: 12 } } }, DetectorName: 'Github', Verified: true, Raw: SECRET }),
  line({ SourceMetadata: { Data: { Git: { commit: '1111111111aa', file: 'old/.env', line: 3 } } }, DetectorName: 'Github', Verified: true, Raw: SECRET }),
  line({ SourceMetadata: { Data: { Filesystem: { file: '/p/.env', line: 2 } } }, DetectorName: 'Stripe', Verified: false, Raw: 'sk_live_51Habcdefghijklmnop' }),
  'not json',
].join('\n')

describe('leaks', () => {
  it('reads findings without keeping the secret', () => {
    const l = leaksOf(OUT, h, true)
    expect(l.map((x) => [x.detector, x.verified, x.count, x.source])).toEqual([['Github', true, 2, 'git'], ['Stripe', false, 1, 'filesystem']])
    expect(l[0]).toMatchObject({ file: 'src/config.ts', line: 12, commit: '9f1c2ab34de5', author: 'Dev dev@example.com', hint: 'ghp_•••••• (40 chars)' })
    expect(JSON.stringify(l)).not.toContain(SECRET)
    expect(JSON.stringify(l)).not.toContain('sk_live_51Habcdefghijklmnop')
    expect(leaksOf(OUT, h, false)[0]!.verified).toBeNull()
    expect(maskSecret('abc')).toBe('••• (3)')
  })

  it('says where to rotate and what to do', () => {
    expect(rotateUrl('Github')).toBe('https://github.com/settings/tokens')
    expect(rotateUrl('SomethingElse')).toBeNull()
    const s = steps(leaksOf(OUT, h, true)[0]!, 'GITHUB_TOKEN')
    expect(s[0]).toMatch(/github\.com\/settings\/tokens/)
    expect(s.join(' ')).toMatch(/git filter-repo --replace-text/)
    expect(steps(leaksOf(OUT, h, true)[1]!, 'STRIPE_API_KEY')).toHaveLength(2)
    expect(vaultNameFor('Github')).toBe('GITHUB_API_KEY')
    expect(vaultNameFor('CloudflareApiToken')).toBe('CLOUDFLAREAPITOKEN')
  })

  it('builds the command lines', () => {
    expect(leakArgs('git', '/p', false)).toEqual(['git', 'file:///p', '--json', '--no-update', '--no-verification'])
    expect(leakArgs('git', '/p', true, 'abc1234')).toEqual(['git', 'file:///p', '--json', '--no-update', '--since-commit', 'abc1234'])
    expect(() => leakArgs('git', '/p', false, 'HEAD; rm')).toThrow(/commit/)
    expect(prePushHook('/usr/bin/trufflehog')).toMatch(/--fail.*183/s)
  })
})
