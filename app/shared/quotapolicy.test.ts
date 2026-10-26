import { describe, expect, it } from 'vitest'
import { confirmsFor, envFor, headroom, isQuotaError, onQuota } from './quotapolicy'

const env = { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-paid', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9999', CLAUDE_CODE_USE_BEDROCK: '1' }

describe('quota policy', () => {
  it('plan only never carries a paid credential or a foreign endpoint', () => {
    const r = envFor('plan', env)
    expect(r.error).toBeUndefined()
    expect(r.env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(r.env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(r.env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
    expect(r.env.PATH).toBe('/bin')
  })
  it('keeps the local proxy in front of the plan', () => {
    expect(envFor('plan', env, { localProxy: 'http://127.0.0.1:9999' }).env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:9999')
  })
  it('api needs a key, custom needs the switch and a URL', () => {
    expect(envFor('api', {}).error).toMatch(/vault/)
    expect(envFor('api', {}, { apiKey: 'k' }).env.ANTHROPIC_API_KEY).toBe('k')
    expect(envFor('custom', env, { customUrl: 'http://localhost:20128' }).error).toMatch(/off/)
    expect(envFor('custom', env, { customOn: true, customUrl: 'ftp://x' }).error).toMatch(/http/)
    const c = envFor('custom', env, { customOn: true, customUrl: 'http://localhost:20128' })
    expect(c.env.ANTHROPIC_BASE_URL).toBe('http://localhost:20128')
    expect(c.env.ANTHROPIC_API_KEY).toBeUndefined()
  })
  it('setup leaves the environment alone', () => expect(envFor('setup', env).env).toEqual(env))
  it('reads quota errors and pauses only the plan', () => {
    expect(isQuotaError('API Error: 429 {"type":"rate_limit_error"}')).toBe(true)
    expect(isQuotaError("Claude AI usage limit reached|1700000000")).toBe(true)
    expect(isQuotaError('529 Overloaded')).toBe(false)
    expect(isQuotaError('ENOENT')).toBe(false)
    expect(onQuota('plan')).toBe('pause')
    expect(onQuota('api')).toBe('report')
  })
  it('asks twice before plan traffic goes through a custom endpoint', () => {
    expect(confirmsFor('plan', 'custom')).toBe(2)
    expect(confirmsFor('api', 'custom')).toBe(1)
    expect(confirmsFor('plan', 'plan')).toBe(0)
  })
  it('headroom is the tightest window', () => {
    expect(headroom([{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 85 }])).toMatchObject({ kind: 'seven_day', percent: 85, level: 'warn' })
    expect(headroom([])).toBeNull()
  })
})
