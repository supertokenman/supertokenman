import { describe, expect, it } from 'vitest'
import { contrast, exportAs, extract, fromOklch, harmony, HARMONIES, themeFrom, toOklch } from './colorKit'

describe('colorKit', () => {
  it('round-trips through OKLCH', () => {
    for (const h of ['#d97757', '#4f7cff', '#3fae6a', '#141413', '#ffffff']) expect(fromOklch(toOklch(h))).toBe(h)
  })
  it('makes five valid colors for every harmony', () => {
    for (const m of HARMONIES) {
      const p = harmony('#d97757', m)
      expect(p).toHaveLength(5)
      for (const c of p) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(harmony('#d97757', 'triadic')[0]).toBe('#d97757')
  })
  it('measures contrast like WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })
  it('builds a theme whose text reads, light and dark, from any palette', () => {
    for (const pal of [['#ffe066', '#fff3b0', '#ffd23f'], ['#0b132b', '#1c2541', '#3a506b'], ['#ff006e', '#8338ec', '#3a86ff']])
      for (const scheme of ['light', 'dark'] as const) {
        const t = themeFrom(pal, scheme)
        expect(contrast(t.c.text, t.c.bg)).toBeGreaterThanOrEqual(7)
        expect(contrast(t.c.muted, t.c.bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.c.accent, t.c.bg)).toBeGreaterThanOrEqual(3)
        expect(contrast(t.c.onAccent, t.c.accent)).toBeGreaterThanOrEqual(3)
      }
  })
  it('finds the main colors of an image', () => {
    const px = new Uint8ClampedArray(400 * 4)
    for (let i = 0; i < 400; i++) px.set(i < 300 ? [200, 30, 30, 255] : [20, 40, 200, 255], i * 4)
    const c = extract(px, 2)
    expect(c[0]).toBe('#c81e1e')
    expect(c[1]).toBe('#1428c8')
  })
  it('exports as code', () => {
    expect(exportAs(['#111111', '#222222'], 'css')).toContain('--brand-200: #222222;')
    expect(exportAs(['#111111'], 'tailwind')).toContain("100: '#111111'")
    expect(JSON.parse(exportAs(['#111111'], 'json')).color.brand[100].$value).toBe('#111111')
  })
})
