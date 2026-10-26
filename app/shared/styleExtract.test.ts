import { describe, expect, it } from 'vitest'
import { cssOf, hex, tailwindOf, tokensOf, type Sample } from './styleExtract'

const s = (p: Partial<Sample>): Sample => ({ tag: 'div', color: 'rgb(20, 20, 20)', bg: 'rgba(0, 0, 0, 0)', font: 'Inter, sans-serif', size: 16, weight: 400, radius: 0, shadow: 'none', padding: 0, gap: 0, area: 100, text: false, ...p })

describe('style from a reference', () => {
  it('reads colors in any notation and drops see-through ones', () => {
    expect(hex('rgb(255, 0, 16)')).toBe('#ff0010')
    expect(hex('rgba(0, 0, 0, 0)')).toBeNull()
    expect(hex('#ABCDEF')).toBe('#abcdef')
  })
  it('names the page, its surfaces, text, accent and border by how much they cover', () => {
    const t = tokensOf([
      s({ tag: 'body', bg: 'rgb(250, 250, 250)', area: 100000 }),
      s({ bg: 'rgb(255, 255, 255)', area: 30000, radius: 12, padding: 24, border: 'rgb(228, 228, 231)', shadow: '0 1px 2px rgba(0,0,0,.1)' }),
      s({ bg: 'rgb(252, 252, 252)', area: 500 }),
      s({ tag: 'p', text: true, color: 'rgb(24, 24, 27)', area: 20000, size: 16 }),
      s({ tag: 'p', text: true, color: 'rgb(113, 113, 122)', area: 6000, size: 14 }),
      s({ tag: 'h1', text: true, color: 'rgb(24, 24, 27)', font: '"Cal Sans", Inter', size: 40, weight: 700, area: 4000 }),
      s({ tag: 'button', text: true, color: 'rgb(255, 255, 255)', bg: 'rgb(37, 99, 235)', area: 1500, radius: 8, padding: 8, weight: 600 }),
      s({ tag: 'code', text: true, font: 'JetBrains Mono, monospace', size: 13, area: 300 }),
    ])
    const c = Object.fromEntries(t.colors.map((x) => [x.name, x.value]))
    expect(c).toEqual({ background: '#fafafa', surface: '#ffffff', text: '#18181b', muted: '#71717a', accent: '#2563eb', border: '#e4e4e7' })
    expect(t.fonts).toEqual([{ role: 'body', family: 'Inter' }, { role: 'heading', family: 'Cal Sans' }, { role: 'mono', family: 'JetBrains Mono' }])
    expect(t.sizes).toEqual([13, 14, 16, 40])
    expect(t.radii).toContain(12)
    expect(t.spacing).toEqual([8, 24])
    expect(t.shadows).toEqual(['0 1px 2px rgba(0,0,0,.1)'])
  })
  it('writes CSS variables and a Tailwind extension', () => {
    const t = tokensOf([s({ tag: 'body', bg: 'rgb(0,0,0)', area: 10 }), s({ text: true, color: 'rgb(255,255,255)', size: 15, radius: 9999 })])
    expect(cssOf(t)).toContain('--background: #000000;')
    expect(cssOf(t)).toContain('--radius-1: 9999px;')
    expect(JSON.parse(tailwindOf(t).split('\n').slice(1).join('\n')).colors.text).toBe('#ffffff')
  })
})
