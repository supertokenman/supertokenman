import { describe, expect, it } from 'vitest'
import { CATALOG, composeOf, deployScript, needsOf } from './selfhost'

describe('self-hosting catalog', () => {
  it('has distinct ids, real links and single images', () => {
    expect(new Set(CATALOG.map((a) => a.id)).size).toBe(CATALOG.length)
    expect(CATALOG.every((a) => a.url.startsWith('https://github.com/') && /^[\w./-]+:[\w.-]+$/.test(a.image) && a.port > 0)).toBe(true)
  })
  it('writes compose bound to localhost with secrets as variables unless given', () => {
    const minio = CATALOG.find((a) => a.id === 'minio')!
    expect(needsOf(minio)).toEqual(['MINIO_ROOT_PASSWORD'])
    const c = composeOf(minio, { hostPort: 9100, publicBind: false })
    expect(c).toContain('- "127.0.0.1:9100:9000"')
    expect(c).toContain('MINIO_ROOT_PASSWORD: "${MINIO_ROOT_PASSWORD}"')
    expect(c).toContain('minio-data:/data')
    expect(composeOf(minio, { hostPort: 9100, publicBind: true, secrets: { MINIO_ROOT_PASSWORD: 'p"w' } })).toContain('MINIO_ROOT_PASSWORD: "p\\"w"')
    expect(composeOf(CATALOG.find((a) => a.id === 'dozzle')!, { hostPort: 8081, publicBind: false })).not.toContain('volumes:')
    expect(deployScript('gitea')).toContain('"$HOME"/selfhost/gitea/compose.yml')
  })
})
