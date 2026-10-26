import { describe, expect, it } from 'vitest'
import { riskOf } from './cmdrisk'
import { findRecipes, RECIPES, SOURCES } from './oneliners'

describe('one-liners', () => {
  it('has about 150 recipes, each with a plain ask and a command', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(140)
    for (const r of RECIPES) {
      expect(r.ask.length, r.cmd).toBeGreaterThan(5)
      expect(r.cmd.trim()).toBe(r.cmd)
    }
    expect(SOURCES.every((s) => s.url.startsWith('https://github.com/'))).toBe(true)
  })
  it('no recipe is one the command bar would block', () => {
    expect(RECIPES.filter((r) => riskOf(r.cmd).level === 'blocked').map((r) => r.cmd)).toEqual([])
  })
  it('finds by plain words, for this system', () => {
    expect(findRecipes('free port 3000', 'mac')[0]!.cmd).toContain('lsof -ti tcp:3000')
    expect(findRecipes('who uses the disk', 'linux')[0]!.cmd).toContain('du -sh')
    expect(findRecipes('memory', 'mac').every((r) => r.os !== 'linux')).toBe(true)
    expect(findRecipes('ls', 'mac')).toEqual([])
  })
})
