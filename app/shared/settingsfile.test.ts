import { describe, expect, it } from 'vitest'
import { credentialFields, dump, load, VERSION } from './settingsfile'

const defaults = { integrations: ['context7'] }

describe('settings file', () => {
  it('migrates an old file and keeps unknown fields', () => {
    const r = load(JSON.stringify({ integrations: ['a', 3], feeds: [{ url: 'x' }], echartsTheme: 'dark' }), defaults)
    expect(r.migrated).toBe(true)
    expect(r.settings.version).toBe(VERSION)
    expect(r.settings.integrations).toEqual(['a'])
    expect(r.settings.feeds).toEqual([{ url: 'x' }])
    expect('echartsTheme' in r.settings).toBe(false)
  })
  it('falls back to defaults on a broken file and says why', () => {
    const r = load('{"integrations": [', defaults)
    expect(r.broken).toBeTruthy()
    expect(r.settings.integrations).toEqual(['context7'])
    expect(load(JSON.stringify({ version: 2, phone: { port: 80 } }), defaults).broken).toMatch(/phone\.port/)
  })
  it('drops credentials on load and refuses them on save', () => {
    const r = load(JSON.stringify({ version: 2, integrations: [], providers: [{ name: 'x', apiKey: 'sk-123456789' }], github: { token: 'ghp_x123' }, keyName: 'OPENAI_API_KEY' }), defaults)
    expect(r.dropped).toEqual(['providers[0].apiKey', 'github.token'])
    expect(JSON.stringify(r.settings)).not.toContain('sk-123456789')
    expect(r.settings.keyName).toBe('OPENAI_API_KEY')
    expect(load(JSON.stringify({ providers: [{ apiKey: 'sk-123456789' }] }), defaults).backup).not.toContain('sk-123456789')
    expect(() => dump({ integrations: [], stripeSecret: 'sk_live_abc' })).toThrow(/vault/)
    expect(() => dump({ integrations: [], voiceId: 'BAD VOICE' })).toThrow(/voiceId/)
    expect(JSON.parse(dump({ integrations: [] })).version).toBe(VERSION)
  })
  it('finds credential fields by name only when they hold text', () => {
    expect(credentialFields({ token: '', passwordHint: 'x', a: [{ db_password: 'p' }] })).toEqual(['a[0].db_password'])
  })
})
