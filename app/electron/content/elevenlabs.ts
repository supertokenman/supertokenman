// ElevenLabs, the optional paid voice. The key lives in the vault and is used here, in the main
// process, and handed to the render as an environment variable; the window only sees voice names.

export type ElevenVoice = { id: string; name: string; labels: string }
export type ElevenUsage = { used: number; limit: number; resets?: string; tier: string }

const API = 'https://api.elevenlabs.io'

async function call(doFetch: typeof fetch, key: string, path: string): Promise<unknown> {
  const r = await doFetch(`${API}${path}`, { headers: { 'xi-api-key': key, Accept: 'application/json' } })
  const text = await r.text()
  let j: unknown = null
  try {
    j = text ? JSON.parse(text) : null
  } catch {
    j = null
  }
  if (!r.ok) {
    const detail = (j as { detail?: { message?: string } | string } | null)?.detail
    let msg = typeof detail === 'string' ? detail : (detail?.message ?? '')
    msg = msg.split(key).join('***')
    throw new Error(r.status === 401 ? 'ElevenLabs did not accept this key.' : `ElevenLabs answered ${r.status}${msg ? `: ${msg}` : ''}`)
  }
  return j
}

/** The voices of the account (its own and the ones it added from the library). */
export async function voices(doFetch: typeof fetch, key: string): Promise<ElevenVoice[]> {
  const j = (await call(doFetch, key, '/v1/voices')) as { voices?: { voice_id?: string; name?: string; labels?: Record<string, string> }[] }
  return (j?.voices ?? [])
    .filter((v) => v.voice_id && /^[A-Za-z0-9]{8,40}$/.test(v.voice_id))
    .map((v) => ({ id: v.voice_id!, name: String(v.name ?? v.voice_id).slice(0, 60), labels: Object.values(v.labels ?? {}).join(', ').slice(0, 80) }))
}

/** Characters spent this period against the plan's limit. */
export async function usage(doFetch: typeof fetch, key: string): Promise<ElevenUsage> {
  const j = (await call(doFetch, key, '/v1/user/subscription')) as { character_count?: number; character_limit?: number; next_character_count_reset_unix?: number; tier?: string }
  return {
    used: Number(j?.character_count ?? 0),
    limit: Number(j?.character_limit ?? 0),
    resets: j?.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : undefined,
    tier: String(j?.tier ?? ''),
  }
}
