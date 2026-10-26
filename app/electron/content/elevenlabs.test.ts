import { describe, expect, it } from 'vitest'
import { usage, voices } from './elevenlabs'
import { cleanPiece } from './pieces'

const fake = (status: number, body: unknown, seen: { url?: string; key?: string } = {}) =>
  (async (url: string, init?: RequestInit) => {
    seen.url = url
    seen.key = (init?.headers as Record<string, string>)['xi-api-key']
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch

describe('elevenlabs', () => {
  it('lists the account voices with their labels', async () => {
    const seen: { url?: string; key?: string } = {}
    const v = await voices(fake(200, { voices: [{ voice_id: 'abcDEF123456', name: 'Ana', labels: { accent: 'brazilian', gender: 'female' } }, { voice_id: '../bad', name: 'x' }] }, seen), 'sk_test_key_123456789012')
    expect(v).toEqual([{ id: 'abcDEF123456', name: 'Ana', labels: 'brazilian, female' }])
    expect(seen.url).toBe('https://api.elevenlabs.io/v1/voices')
    expect(seen.key).toBe('sk_test_key_123456789012')
  })
  it('reads the characters spent this period', async () => {
    const u = await usage(fake(200, { character_count: 1200, character_limit: 30000, tier: 'starter', next_character_count_reset_unix: 1790000000 }), 'k')
    expect(u).toMatchObject({ used: 1200, limit: 30000, tier: 'starter' })
  })
  it('says plainly when the key is refused and never echoes it', async () => {
    await expect(usage(fake(401, { detail: { message: 'bad sk_secret_abcdefghijk' } }), 'sk_secret_abcdefghijk')).rejects.toThrow('ElevenLabs did not accept this key.')
    await expect(usage(fake(429, { detail: { message: 'quota for sk_secret_abcdefghijk' } }), 'sk_secret_abcdefghijk')).rejects.toThrow('ElevenLabs answered 429: quota for ***')
  })
  it('accepts ElevenLabs voices on a piece and drops anything else', () => {
    const base = { id: 'a', title: 't', project: '/p', format: 'reel' } as never
    expect(cleanPiece({ ...(base as object), voice: 'eleven:abcDEF123456' } as never).voice).toBe('eleven:abcDEF123456')
    expect(cleanPiece({ ...(base as object), voice: 'eleven:../../x' } as never).voice).toBeUndefined()
  })
})
