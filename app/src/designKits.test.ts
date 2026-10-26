import { describe, expect, it } from 'vitest'
import { contrast } from './colorKit'
import { KITS, kitCss, kitPrompt, searchKits } from './designKits'

describe('design kits', () => {
  it('every kit reads: text 7:1 on its page, the accent button 4.5:1, muted 4.5:1', () => {
    for (const k of KITS) {
      expect(contrast(k.t.text, k.t.bg), k.id).toBeGreaterThanOrEqual(7)
      expect(contrast(k.t.muted, k.t.surface), k.id).toBeGreaterThanOrEqual(4.5)
      expect(contrast(k.t.onAccent, k.t.accent), k.id).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('writes tokens and a build prompt with the chosen accent', () => {
    const k = KITS[0]!
    expect(kitCss(k)).toContain(`--accent: ${k.t.accent};`)
    expect(kitPrompt(k, '#123456')).toContain('--accent: #123456;')
    expect(kitPrompt(k)).toMatch(/Ask before adding dependencies/)
  })
  it('finds kits by use', () => {
    expect(searchKits('finance').map((k) => k.id)).toEqual(['fintech'])
    expect(searchKits('dark').map((k) => k.id)).toContain('glass-dark')
  })
})
