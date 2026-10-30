import { describe, expect, it } from 'vitest'
import { ARGS_MAX, redactArgs } from './auditredact'

describe('redactArgs', () => {
  it('masks environment values, URL credentials and bearer tokens', () => {
    const out = redactArgs('DATABASE_PASSWORD=hunter2hunter2 NODE_ENV=production curl -H "Authorization: Bearer abcdefghijklmnop1234" https://me:s3cret@host.test/x')
    expect(out).not.toContain('hunter2hunter2')
    expect(out).not.toContain('NODE_ENV=production')
    expect(out).not.toContain('abcdefghijklmnop1234')
    expect(out).not.toContain('s3cret')
    expect(out).toContain('https://•••@host.test/x')
    expect(out).toMatch(/NODE_ENV=/)
  })

  it('masks token formats and saved vault values', () => {
    const gh = 'ghp_' + 'a'.repeat(36)
    const out = redactArgs(`push with ${gh} and the vault value myvaultvalue123`, [{ name: 'VAULT_ITEM', value: 'myvaultvalue123' }])
    expect(out).not.toContain(gh)
    expect(out).not.toContain('myvaultvalue123')
  })

  it('leaves ordinary text alone and collapses line breaks', () => {
    expect(redactArgs('ls -la\n  src/')).toBe('ls -la src/')
  })

  it('caps the summary at 300 characters, after masking', () => {
    const long = redactArgs('a'.repeat(1000))
    expect(long.length).toBe(ARGS_MAX)
    expect(long.endsWith('…')).toBe(true)
    expect(redactArgs('x'.repeat(300)).length).toBe(300)
    expect(redactArgs('x'.repeat(301)).length).toBe(300)
  })

  it('does not leak a secret that sits across the cap boundary', () => {
    const key = 'sk-ant-' + 'z'.repeat(30)
    const out = redactArgs('p'.repeat(290) + ' ' + key + ' tail')
    expect(out).not.toContain('zzzzzzzzzz')
    expect(out.length).toBeLessThanOrEqual(ARGS_MAX)
  })
})
