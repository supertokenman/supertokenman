import { describe, expect, it } from 'vitest'
import { PUBLIC_SETTING_KEYS, publicSettings } from './pilotread'

const all = { hotkey: 'Alt+Space', smallModel: 'small-1', headroom: true, voiceId: 'pt_br', mcpSend: true, phone: { port: 4000 }, apiKey: 'sk-x', integrations: ['gh'] }

describe('publicSettings', () => {
  it('returns allowlisted keys only', () => {
    const r = publicSettings(all)
    expect(Object.keys(r.values).sort()).toEqual(['headroom', 'hotkey', 'smallModel', 'voiceId'])
  })
  it('never returns a key outside the allowlist, even when asked for it', () => {
    const r = publicSettings(all, { keys: ['mcpSend', 'apiKey', 'hotkey'] })
    expect(r.values).toEqual({ hotkey: 'Alt+Space' })
    expect(r.withheld).toEqual(['mcpSend', 'apiKey'])
  })
  it('drops vault-backed keys even when allowlisted', () => {
    const r = publicSettings(all, { vaultBacked: ['smallModel'] })
    expect(r.values).not.toHaveProperty('smallModel')
    expect(r.withheld).toContain('smallModel')
  })
  it('never leaks a value of a withheld key', () => {
    const r = publicSettings(all, { keys: ['apiKey'] })
    expect(JSON.stringify(r)).not.toContain('sk-x')
  })
  it('allowlists no credential-looking or widening key', () => {
    for (const k of PUBLIC_SETTING_KEYS) {
      expect(/api_?key|token|secret|password/i.test(k)).toBe(false)
      expect(['mcpSend', 'phone', 'integrations', 'providers', 'dbConns', 'triggers', 'personas', 'budget']).not.toContain(k)
    }
  })
})
