// Writes dist-electron/cli-manifest.json: the Claude Code build each platform downloads on first need,
// copied from package-lock.json (name, version, registry URL, sha512 integrity) so the app never reads
// node_modules or asks the registry what is latest. Fails the build when a Mac arch has no pin (0.1.21
// shipped an Intel build with no Claude binary). Usage: node scripts/cli-manifest.mjs [out]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SDK = '@anthropic-ai/claude-agent-sdk'
export const REQUIRED = ['darwin-arm64', 'darwin-x64']

/** lock: package-lock.json; sdkPkg: the SDK's package.json (for claudeCodeVersion). */
export function buildManifest(lock, sdkPkg) {
  const sdk = lock.packages?.[`node_modules/${SDK}`]
  if (!sdk) throw new Error(`${SDK} is not in package-lock.json`)
  if (sdkPkg.version !== sdk.version) throw new Error(`node_modules has ${SDK} ${sdkPkg.version}, the lockfile ${sdk.version}`)
  const cli = sdkPkg.claudeCodeVersion
  if (!/^\d+\.\d+\.\d+/.test(cli ?? '')) throw new Error(`${SDK} names no claudeCodeVersion`)
  const platforms = {}
  for (const name of Object.keys(sdk.optionalDependencies ?? {})) {
    const key = name.slice(`${SDK}-`.length)
    if (!name.startsWith(`${SDK}-`) || key.endsWith('-musl')) continue
    const p = lock.packages[`node_modules/${name}`]
    if (!p) throw new Error(`${name} is not in package-lock.json`)
    const url = new URL(p.resolved)
    if (url.protocol !== 'https:' || url.host !== 'registry.npmjs.org') throw new Error(`${name} resolves to ${url.host}, not the npm registry`)
    if (!/^sha512-/.test(p.integrity ?? '')) throw new Error(`${name} has no sha512 integrity`)
    if (p.version !== sdk.version) throw new Error(`${name} is ${p.version}, the SDK ${sdk.version}`)
    platforms[key] = { name, version: p.version, url: p.resolved, integrity: p.integrity }
  }
  for (const k of REQUIRED) if (!platforms[k]) throw new Error(`no pinned Claude Code build for ${k}`)
  return { sdk: sdk.version, cli, platforms }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = process.argv[2] ?? join(app, 'dist-electron', 'cli-manifest.json')
  const m = buildManifest(JSON.parse(readFileSync(join(app, 'package-lock.json'), 'utf8')), JSON.parse(readFileSync(join(app, 'node_modules', SDK, 'package.json'), 'utf8')))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(m, null, 2) + '\n')
  console.log(`cli-manifest: Claude Code ${m.cli} (SDK ${m.sdk}) for ${Object.keys(m.platforms).join(', ')}`)
}
