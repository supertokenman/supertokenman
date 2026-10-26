import { describe, expect, it } from 'vitest'
import { DESIGN_SYSTEMS, PALETTES, search } from './paletteLibrary'

describe('palette library', () => {
  it('has only valid colors', () => {
    for (const p of PALETTES) for (const c of p.colors) expect(c, p.name).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('finds by mood in Portuguese or English, accents or not', () => {
    expect(search(PALETTES, 'praia').map((p) => p.name)).toContain('Lençóis')
    expect(search(PALETTES, 'lencois').map((p) => p.name)).toEqual(['Lençóis'])
    expect(search(PALETTES, 'retro neon').map((p) => p.name)).toEqual(expect.arrayContaining(['Sunset Synth', 'Arcade']))
  })
  it('finds design systems by what they cover', () => {
    expect(search(DESIGN_SYSTEMS, 'tokens react', (d) => d.what).length).toBeGreaterThanOrEqual(2)
    for (const d of DESIGN_SYSTEMS) expect(d.url).toMatch(/^https:\/\//)
  })
})
