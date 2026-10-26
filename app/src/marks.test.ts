import { describe, expect, it } from 'vitest'
import { GLYPH_IDS, markOf } from './IntegrationMark'

describe('markOf', () => {
  it('has a mark for every integration in the catalog', async () => {
    const { CATALOG } = await import('../electron/integrations')
    for (const c of CATALOG) {
      expect(markOf(c.id).color, c.id).not.toBe('#6b7280')
      expect(GLYPH_IDS, c.id).toContain(c.id)
    }
    for (const n of ['instagram', 'facebook', 'threads', 'youtube', 'linkedin', 'x', 'tiktok']) expect(GLYPH_IDS).toContain(n)
  })
  it('makes one from the name for anything else', () => {
    expect(markOf('x-custom', 'my server')).toEqual({ letters: 'Ms', color: '#6b7280' })
  })
})
