import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs script
import { buildManifest } from './cli-manifest.mjs'

const SDK = '@anthropic-ai/claude-agent-sdk'
const pkg = (k: string, over: Record<string, unknown> = {}) => ({ version: '1.0.0', resolved: `https://registry.npmjs.org/${SDK}-${k}/-/claude-agent-sdk-${k}-1.0.0.tgz`, integrity: `sha512-${k}AAAA==`, ...over })
const lock = (over: Record<string, unknown> = {}) => ({
  packages: {
    [`node_modules/${SDK}`]: { version: '1.0.0', optionalDependencies: { [`${SDK}-darwin-arm64`]: '1.0.0', [`${SDK}-darwin-x64`]: '1.0.0', [`${SDK}-linux-x64`]: '1.0.0', [`${SDK}-linux-x64-musl`]: '1.0.0' } },
    [`node_modules/${SDK}-darwin-arm64`]: pkg('darwin-arm64'),
    [`node_modules/${SDK}-darwin-x64`]: pkg('darwin-x64'),
    [`node_modules/${SDK}-linux-x64`]: pkg('linux-x64'),
    [`node_modules/${SDK}-linux-x64-musl`]: pkg('linux-x64-musl'),
    ...over,
  },
})
const sdkPkg = { version: '1.0.0', claudeCodeVersion: '2.1.0' }

describe('cli manifest', () => {
  it('copies name, version, registry url and sha512 from the lockfile, without musl', () => {
    const m = buildManifest(lock(), sdkPkg)
    expect(m.sdk).toBe('1.0.0')
    expect(m.cli).toBe('2.1.0')
    expect(Object.keys(m.platforms).sort()).toEqual(['darwin-arm64', 'darwin-x64', 'linux-x64'])
    expect(m.platforms['darwin-x64']).toEqual({ name: `${SDK}-darwin-x64`, version: '1.0.0', url: pkg('darwin-x64').resolved, integrity: 'sha512-darwin-x64AAAA==' })
  })
  it('fails when a Mac cpu has no pin (the 0.1.21 Intel bug)', () => {
    expect(() => buildManifest(lock({ [`node_modules/${SDK}`]: { version: '1.0.0', optionalDependencies: { [`${SDK}-darwin-arm64`]: '1.0.0' } } }), sdkPkg)).toThrow(/darwin-x64/)
  })
  it('refuses another host, a missing sha512 or a version skew', () => {
    expect(() => buildManifest(lock({ [`node_modules/${SDK}-linux-x64`]: pkg('linux-x64', { resolved: 'https://evil.example/x.tgz' }) }), sdkPkg)).toThrow(/npm registry/)
    expect(() => buildManifest(lock({ [`node_modules/${SDK}-linux-x64`]: pkg('linux-x64', { integrity: 'sha1-abc' }) }), sdkPkg)).toThrow(/sha512/)
    expect(() => buildManifest(lock({ [`node_modules/${SDK}-linux-x64`]: pkg('linux-x64', { version: '0.9.0' }) }), sdkPkg)).toThrow(/0.9.0/)
    expect(() => buildManifest(lock(), { version: '1.0.1', claudeCodeVersion: '2.1.0' })).toThrow(/lockfile/)
    expect(() => buildManifest(lock(), { version: '1.0.0' })).toThrow(/claudeCodeVersion/)
  })
  it('works on the real lockfile, both Mac cpus pinned', () => {
    const real = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
    const sdk = real.packages[`node_modules/${SDK}`]
    const m = buildManifest(real, { version: sdk.version, claudeCodeVersion: '2.0.0' })
    for (const k of ['darwin-arm64', 'darwin-x64']) expect(m.platforms[k].url).toMatch(/^https:\/\/registry\.npmjs\.org\//)
  })
})
