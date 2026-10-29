// Brand kit per project: tone, banned words, recurring characters and series. Plain data only: no images,
// no I/O, no network. `brandBlock` renders the kit as text for prompts.

export type BrandCharacter = { name: string; look: string; voice: string }
export type BrandSeries = { name: string; characterIds: string[]; format: string; cadence: string }
export type BrandKit = {
  tone: string
  bannedWords: string[]
  characters: BrandCharacter[]
  series: BrandSeries[]
}

export const MAX_CHARACTERS = 6

export const EMPTY_BRAND_KIT: BrandKit = { tone: '', bannedWords: [], characters: [], series: [] }

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/**
 * Sanitize untrusted input into a BrandKit. Never throws.
 * - strings are trimmed; entries without a name are dropped
 * - banned words are lowercased, deduplicated and emptied entries removed
 * - at most MAX_CHARACTERS characters are kept (extra ones are dropped)
 * - a series keeps only characterIds (= character names) that exist in the cleaned characters
 */
export function cleanBrandKit(input: unknown): BrandKit {
  const k = obj(input)

  const bannedWords = Array.isArray(k.bannedWords)
    ? [...new Set(k.bannedWords.map(str).map((w) => w.toLowerCase()).filter((w) => w !== ''))]
    : []

  const characters: BrandCharacter[] = (Array.isArray(k.characters) ? k.characters : [])
    .map((c) => {
      const o = obj(c)
      return { name: str(o.name), look: str(o.look), voice: str(o.voice) }
    })
    .filter((c) => c.name !== '')
    .slice(0, MAX_CHARACTERS)

  const known = new Set(characters.map((c) => c.name))

  const series: BrandSeries[] = (Array.isArray(k.series) ? k.series : [])
    .map((s) => {
      const o = obj(s)
      const ids = Array.isArray(o.characterIds) ? o.characterIds.map(str).filter((id) => known.has(id)) : []
      return { name: str(o.name), characterIds: [...new Set(ids)], format: str(o.format), cadence: str(o.cadence) }
    })
    .filter((s) => s.name !== '')

  return { tone: str(k.tone), bannedWords, characters, series }
}

/**
 * Text block for prompts (G2 prompts and the Brief). Empty kit gives ''.
 * A character's id is its name (characters have no separate id field).
 */
export function brandBlock(kit: BrandKit): string {
  const lines: string[] = []
  if (kit.tone) lines.push(`Tone: ${kit.tone}`)
  if (kit.bannedWords.length > 0) lines.push(`Never use these words: ${kit.bannedWords.join(', ')}`)
  if (kit.characters.length > 0) {
    lines.push('Characters:')
    for (const c of kit.characters) {
      const parts = [c.look && `look: ${c.look}`, c.voice && `voice: ${c.voice}`].filter(Boolean)
      lines.push(`- ${c.name}${parts.length ? ` (${parts.join('; ')})` : ''}`)
    }
  }
  if (kit.series.length > 0) {
    lines.push('Series:')
    for (const s of kit.series) {
      const who = s.characterIds.length > 0 ? `; characters: ${s.characterIds.join(', ')}` : ''
      const fmt = s.format ? `; format: ${s.format}` : ''
      const cad = s.cadence ? `; cadence: ${s.cadence}` : ''
      lines.push(`- ${s.name}${fmt}${cad}${who}`)
    }
  }
  return lines.join('\n')
}
