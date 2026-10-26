import { describe, expect, it } from 'vitest'
import { cssVars, resolve, themeSvg, THEMES } from './themes'

describe('themes', () => {
  it('resolves ids and follows the system', () => {
    expect(resolve('game-boy').name).toBe('Game Boy')
    expect(resolve('nope').id).toBe('claude-dark')
    expect(resolve('system', false).id).toBe('claude-paper')
    expect(resolve('system', true).id).toBe('claude-dark')
  })

  it('gives every theme every variable, and light ones dark overlays', () => {
    const keys = Object.keys(cssVars(THEMES[0]!)).sort()
    for (const t of THEMES) expect(Object.keys(cssVars(t)).sort()).toEqual(keys)
    expect(cssVars(resolve('claude-paper'))['--overlay-rgb']).toBe('0, 0, 0')
    expect(cssVars(resolve('arcade-neon'))['--accent-rgb']).toBe('255, 61, 127')
  })

  it('recolors base-palette SVGs and leaves other colors alone', () => {
    const svg = '<rect fill="#D97757"/><rect fill="#141413"/><rect fill="#f0b23e"/>'
    expect(themeSvg(svg, resolve('claude-dark'))).toBe(svg)
    expect(themeSvg(svg, resolve('arcade-neon'))).toBe('<rect fill="#ff3d7f"/><rect fill="#0b0820"/><rect fill="#f0b23e"/>')
  })
})
