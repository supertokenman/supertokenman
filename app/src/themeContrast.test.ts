import { describe, expect, it } from 'vitest'
import { contrast } from './colorKit'
import { THEMES } from './themes'
import { matrix } from './themeContrast'

describe('theme contrast', () => {
  it('the WCAG formula matches known pairs', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })
  for (const t of THEMES)
    it(`${t.id} keeps every rule`, () => {
      expect(matrix(t).filter((r) => !r.ok).map((r) => `${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${r.min}`)).toEqual([])
    })
})

describe('applied colours', () => {
  it('reads the page variables into the matrix', async () => {
    const { appliedColors } = await import('./themeContrast')
    const { cssVars } = await import('./themes')
    const vars = cssVars(THEMES[1]!)
    expect(matrix(appliedColors((v) => ` ${vars[v]} `))).toEqual(matrix(THEMES[1]!))
  })
})
