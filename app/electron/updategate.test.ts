import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
import { AUTO_DELAY_MS, autoDelay, checkAllowed, releaseMode } from './updategate.js'

describe('update gate (v0.1.12 Mac proof regression)', () => {
  it('a fresh profile never checks on its own', () => {
    expect(checkAllowed(true, undefined)).toBe(false)
    expect(checkAllowed(true, false)).toBe(false)
    expect(checkAllowed(true, true)).toBe(true)
  })
  it('the Update button always checks', () => {
    expect(checkAllowed(false, undefined)).toBe(true)
  })
  it('release mode: packaged Mac with app-update.yml, or forced for netwatch', () => {
    expect(releaseMode({ packaged: true, platform: 'darwin', hasUpdateYml: true })).toBe(true)
    expect(releaseMode({ packaged: false, platform: 'darwin', hasUpdateYml: true })).toBe(false)
    expect(releaseMode({ packaged: false, platform: 'linux', hasUpdateYml: false, env: { STM_UPDATE_RELEASE_MODE: '1' } })).toBe(true)
  })
  it('the automatic check waits well past launch', () => {
    expect(AUTO_DELAY_MS).toBeGreaterThanOrEqual(30_000)
    expect(autoDelay({})).toBe(AUTO_DELAY_MS)
    expect(autoDelay({ STM_UPDATE_DELAY_MS: '2000' })).toBe(2000)
  })
  it('main.ts gates on the opt-in and waits before the automatic check', () => {
    const main = readFileSync(join(here, 'main.ts'), 'utf8')
    expect(main).toMatch(/checkAllowed\(auto === true, settings\(\)\.updateCheck\)/)
    expect(main).not.toMatch(/settings\(\)\.updateCheck !== false/)
    expect(main).toMatch(/setTimeout\(ok, UG\.autoDelay\(process\.env\)\)/)
  })
})
