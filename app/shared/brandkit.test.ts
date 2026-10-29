import { describe, expect, it } from 'vitest'
import { EMPTY_BRAND_KIT, MAX_CHARACTERS, brandBlock, cleanBrandKit } from './brandkit.js'

const char = (name: string) => ({ name, look: `${name} look`, voice: `${name} voice` })

describe('cleanBrandKit', () => {
  it('returns an empty kit for non-object input', () => {
    expect(cleanBrandKit(null)).toEqual(EMPTY_BRAND_KIT)
    expect(cleanBrandKit('x')).toEqual(EMPTY_BRAND_KIT)
    expect(cleanBrandKit([1, 2])).toEqual(EMPTY_BRAND_KIT)
  })

  it('trims tone and lowercases, dedupes and drops empty banned words', () => {
    const kit = cleanBrandKit({ tone: '  warm  ', bannedWords: ['Cheap', ' cheap ', '', '  ', 'SALE'] })
    expect(kit.tone).toBe('warm')
    expect(kit.bannedWords).toEqual(['cheap', 'sale'])
  })

  it('drops characters without a name and trims the rest', () => {
    const kit = cleanBrandKit({ characters: [{ name: ' Ana ', look: ' red hat ' }, { name: '  ' }, 5] })
    expect(kit.characters).toEqual([{ name: 'Ana', look: 'red hat', voice: '' }])
  })

  it('keeps at most 6 characters', () => {
    expect(MAX_CHARACTERS).toBe(6)
    const many = Array.from({ length: 9 }, (_, i) => char(`c${i}`))
    const kit = cleanBrandKit({ characters: many })
    expect(kit.characters).toHaveLength(6)
    expect(kit.characters.map((c) => c.name)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5'])
  })

  it('keeps only series character ids that exist, deduped', () => {
    const kit = cleanBrandKit({
      characters: [char('Ana')],
      series: [{ name: 'Monday', characterIds: ['Ana', 'Ghost', 'Ana'], format: 'choice', cadence: 'weekly' }],
    })
    expect(kit.series).toEqual([
      { name: 'Monday', characterIds: ['Ana'], format: 'choice', cadence: 'weekly' },
    ])
  })

  it('drops series without a name', () => {
    expect(cleanBrandKit({ series: [{ name: '', characterIds: [] }] }).series).toEqual([])
  })
})

describe('brandBlock', () => {
  it('is empty for an empty kit', () => {
    expect(brandBlock(EMPTY_BRAND_KIT)).toBe('')
  })

  it('renders tone, banned words, characters and series', () => {
    const kit = cleanBrandKit({
      tone: 'dry',
      bannedWords: ['cheap'],
      characters: [char('Ana')],
      series: [{ name: 'Monday', characterIds: ['Ana'], format: 'choice', cadence: 'weekly' }],
    })
    const text = brandBlock(kit)
    expect(text).toContain('Tone: dry')
    expect(text).toContain('Never use these words: cheap')
    expect(text).toContain('- Ana (look: Ana look; voice: Ana voice)')
    expect(text).toContain('- Monday; format: choice; cadence: weekly; characters: Ana')
  })
})
