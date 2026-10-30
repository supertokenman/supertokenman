import { describe, expect, it } from 'vitest'
import { MANIFEST_MAX_BYTES, parseManifest } from './packmanifest'

const example = {
  schema: 1,
  id: 'postgres-helper',
  name: 'Postgres helper',
  version: '1.2.0',
  description: 'Skills and a read-only database server for working with Postgres.',
  files: [{ from: 'skills/query-plan/SKILL.md', to: '.claude/skills/postgres-helper/query-plan/SKILL.md', kind: 'skill' }],
  mcp: [
    { name: 'pg', type: 'stdio', command: 'npx', args: ['-y', '@example/pg-mcp@3.1.0', '--read-only'], env: ['DATABASE_URL'] },
    { name: 'docs', type: 'http', url: 'https://docs.example.com/mcp' },
  ],
  hosts: ['docs.example.com', 'registry.npmjs.org'],
  env: [{ name: 'DATABASE_URL', why: 'Connection string for the pg server', secret: true }],
  rules: { text: 'Prefer EXPLAIN ANALYZE before suggesting an index.' },
}

const withFields = (over: Record<string, unknown>) => JSON.stringify({ ...example, ...over })

function errors(raw: string): string {
  const r = parseManifest(raw)
  if (r.ok) throw new Error('expected rejection')
  return r.errors.join('\n')
}

describe('pack.json validation', () => {
  it('accepts the spec example', () => {
    const r = parseManifest(JSON.stringify(example))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.id).toBe('postgres-helper')
      expect(r.manifest.mcp).toHaveLength(2)
    }
  })

  it('rejects unknown keys at top level and inside a server', () => {
    expect(errors(withFields({ extra: 1 }))).toMatch(/Unrecognized key/)
    const bad = { ...example, mcp: [{ ...example.mcp[1], extra: true }] }
    expect(errors(JSON.stringify(bad))).toMatch(/mcp\.0/)
  })

  it('rejects a bad id, schema literal and semver', () => {
    expect(errors(withFields({ id: 'Postgres_Helper' }))).toMatch(/^id:/m)
    expect(errors(withFields({ id: 'a' }))).toMatch(/^id:/m)
    expect(errors(withFields({ schema: 2 }))).toMatch(/^schema:/m)
    expect(errors(withFields({ version: '1.2' }))).toMatch(/^version:/m)
    expect(parseManifest(withFields({ version: '1.2.0-rc.1' })).ok).toBe(true)
  })

  it('rejects a remote host that is not declared in hosts', () => {
    expect(errors(withFields({ hosts: ['registry.npmjs.org'] }))).toMatch(/host docs\.example\.com is not in hosts/)
  })

  it('rejects a stdio env name that is not declared in env', () => {
    expect(errors(withFields({ env: [] }))).toMatch(/DATABASE_URL is not declared in env/)
  })

  it('rejects http URLs except on loopback, and https stays allowed', () => {
    const http = { ...example, mcp: [{ name: 'docs', type: 'http', url: 'http://docs.example.com/mcp' }], hosts: ['docs.example.com'] }
    expect(errors(JSON.stringify(http))).toMatch(/must be https/)
    const loop = { ...example, mcp: [{ name: 'local', type: 'sse', url: 'http://localhost:8080/sse' }], hosts: ['localhost'] }
    expect(parseManifest(JSON.stringify(loop)).ok).toBe(true)
  })

  it('rejects bad stdio commands and accepts relative paths in the pack', () => {
    const cmd = (command: string) => ({ ...example, mcp: [{ name: 'x', type: 'stdio', command, args: [], env: [] }] })
    expect(errors(JSON.stringify(cmd('curl')))).toMatch(/command must be one of/)
    expect(errors(JSON.stringify(cmd('/usr/bin/node')))).toMatch(/relative/)
    expect(errors(JSON.stringify(cmd('../bin/server')))).toMatch(/relative/)
    expect(errors(JSON.stringify(cmd('bin/../server')))).toMatch(/relative/)
    expect(parseManifest(JSON.stringify(cmd('./bin/server'))).ok).toBe(true)
    expect(parseManifest(JSON.stringify(cmd('node'))).ok).toBe(true)
  })

  it('requires the registry host for npx, uvx and docker commands', () => {
    const npx = { ...example, hosts: ['docs.example.com'] }
    expect(errors(JSON.stringify(npx))).toMatch(/list registry\.npmjs\.org in hosts/)
    const uvx = { ...example, mcp: [{ name: 'py', type: 'stdio', command: 'uvx', args: [], env: [] }], hosts: [] }
    expect(errors(JSON.stringify(uvx))).toMatch(/pypi\.org/)
  })

  it('checks host syntax and wildcards', () => {
    expect(errors(withFields({ hosts: ['https://docs.example.com', 'registry.npmjs.org'] }))).toMatch(/hostname only/)
    expect(errors(withFields({ hosts: ['*', 'registry.npmjs.org'] }))).toMatch(/hostname only/)
    const wild = { ...example, hosts: ['docs.example.com', '*.example.com', 'registry.npmjs.org'] }
    expect(parseManifest(JSON.stringify(wild)).ok).toBe(true)
  })

  it('checks env names', () => {
    const env = [{ name: 'database_url', why: 'x', secret: false }]
    expect(errors(withFields({ env }))).toMatch(/environment variable name/)
  })

  it('rejects duplicate targets and oversized rules', () => {
    const f = example.files[0]
    expect(errors(withFields({ files: [f, { ...f, from: 'other.md' }] }))).toMatch(/duplicate target/)
    expect(errors(withFields({ rules: { text: 'a'.repeat(8193) } }))).toMatch(/larger than 8 KB/)
  })

  it('rejects non-JSON and oversized input', () => {
    expect(parseManifest('{ nope')).toEqual({ ok: false, errors: ['pack.json: not valid JSON'] })
    expect(parseManifest(' '.repeat(MANIFEST_MAX_BYTES + 1)).ok).toBe(false)
  })
})
