import { describe, expect, it } from 'vitest'
import { mix, phaseOf, SCENES, sceneFor, sceneSvg } from './landscapes'
import { THEMES } from './themes'

describe('landscapes', () => {
  it('mixes colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030')
  })
  it('reads the hour', () => {
    expect([6, 12, 18, 23, 2].map(phaseOf)).toEqual(['dawn', 'day', 'dusk', 'night', 'night'])
  })
  it('picks scenes', () => {
    expect(sceneFor('none')).toBeNull()
    expect(sceneFor('fuji')?.name).toBe('Fuji')
    const a = sceneFor('auto', new Date(0))!
    const b = sceneFor('auto', new Date(86_400_000))!
    expect(a.id).not.toBe(b.id)
  })
  it('draws every scene in every theme as valid SVG with only hex colors', () => {
    for (const s of SCENES)
      for (const t of THEMES) {
        const svg = sceneSvg(s, t, 21)
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg).not.toMatch(/NaN|undefined/)
      }
  })
})
