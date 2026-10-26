import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Vault, type Cipher } from './vault'
import { serversFor } from './integrations'

// a stand-in for safeStorage: reversible, and never the plain text on disk
const cipher: Cipher = { available: () => true, encrypt: (s) => Buffer.from([...s].reverse().join(''), 'utf8'), decrypt: (b) => [...b.toString('utf8')].reverse().join('') }

describe('Vault', () => {
  it('stores values encrypted, lists names only, and survives a restart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'stm-v-')), 'vault.json')
    const v = new Vault(file, cipher)
    v.set('SUPABASE_ACCESS_TOKEN', 'sbp_secret_value')
    expect(readFileSync(file, 'utf8')).not.toContain('sbp_secret_value')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(v.list()).toEqual([{ name: 'SUPABASE_ACCESS_TOKEN', savedAt: expect.any(Number), forCommands: false }])
    expect(new Vault(file, cipher).get('SUPABASE_ACCESS_TOKEN')).toBe('sbp_secret_value')
  })

  it('gives commands only what is marked for them', () => {
    const v = new Vault(join(mkdtempSync(join(tmpdir(), 'stm-v-')), 'vault.json'), cipher)
    v.set('CLOUDFLARE_API_TOKEN', 'cf_token_1234')
    v.set('NEON_API_KEY', 'napi_xyz')
    v.setForCommands('CLOUDFLARE_API_TOKEN', true)
    expect(v.commandEnv()).toEqual({ CLOUDFLARE_API_TOKEN: 'cf_token_1234' })
  })

  it('refuses bad names and a missing keychain', () => {
    const v = new Vault(join(mkdtempSync(join(tmpdir(), 'stm-v-')), 'vault.json'), cipher)
    expect(() => v.set('my token', 'x')).toThrow('UPPER_SNAKE_CASE')
    const locked = new Vault(join(mkdtempSync(join(tmpdir(), 'stm-v-')), 'vault.json'), { ...cipher, available: () => false })
    expect(() => locked.set('A_KEY', 'x')).toThrow('keychain')
  })
})

describe('integrations', () => {
  it('builds servers from the vault and reports what is missing', () => {
    const secrets: Record<string, string> = { NEON_API_KEY: 'napi_1' }
    const r = serversFor(['neon', 'supabase', 'context7', 'cloudflare'], (n) => secrets[n])
    expect(Object.keys(r.servers)).toEqual(['neon', 'cloudflare', 'context7'])
    expect(r.servers.neon).toEqual({ type: 'http', url: 'https://mcp.neon.tech/mcp', headers: { Authorization: 'Bearer napi_1' } })
    expect(r.servers.cloudflare).toMatchObject({ type: 'stdio', args: ['-y', 'mcp-remote@0.15.2', 'https://bindings.mcp.cloudflare.com/mcp'] })
    expect(r.missing).toEqual([{ id: 'supabase', secret: 'SUPABASE_ACCESS_TOKEN' }])
  })
})
