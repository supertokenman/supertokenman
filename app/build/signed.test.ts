import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const signed = require('./signed.cjs')

describe('Developer ID build config', () => {
  it('signs with a real identity, hardened runtime and notarization', () => {
    expect('identity' in signed.mac).toBe(false)
    expect(signed.mac.notarize).toBe(true)
    expect(signed.mac.hardenedRuntime).toBe(true)
    expect(signed.afterPack).toBe('build/fuses.cjs')
  })
  it('keeps library validation on and carries no credential', () => {
    const plist = readFileSync(new URL('./entitlements.signed.plist', import.meta.url), 'utf8')
    expect(plist).not.toContain('<key>com.apple.security.cs.disable-library-validation</key>')
    const text = JSON.stringify(signed)
    expect(text).not.toMatch(/APPLE_ID|password|-----BEGIN|\.p8"/i)
  })
  it('updates from the public releases repo', () => {
    expect(signed.publish).toEqual({ provider: 'github', owner: 'supertokenman', repo: 'supertokenman', releaseType: 'release' })
  })
  it('names the dmg without the version, for the download links', () => {
    expect(signed.dmg.artifactName).toBe('SuperTokenMan-${arch}.${ext}')
  })
})
