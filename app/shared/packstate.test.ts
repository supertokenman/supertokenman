import { describe, expect, it } from 'vitest'
import {
  emptyState, findInstall, readState, recordRollback, recordUpdate, removeInstall, upsertInstall, writeState,
  type PackInstall, type PackState,
} from './packstate.js'

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const install = (o: Partial<PackInstall> = {}): PackInstall => ({
  packId: 'postgres-helper', scope: 'project', root: '/home/u/app', version: '1.2.0', previous: '1.1.0',
  source: { kind: 'git', url: 'https://github.com/x/pg-pack', commit: 'abc123f' }, installedAt: 1761800000000,
  files: [{ to: '.claude/skills/postgres-helper/query-plan/SKILL.md', sha256: H1 }], rulesSha256: H2,
  mcpEnabled: { pg: false, docs: false }, hostsApproved: ['docs.example.com'], ...o,
})
const key = { packId: 'postgres-helper', scope: 'project' as const, root: '/home/u/app' }
const withOne = (): PackState => upsertInstall(emptyState(), install())

describe('packstate', () => {
  it('round trips a state through text', () => {
    const s = withOne()
    const text = writeState(s)
    expect(text.endsWith('\n')).toBe(true)
    const r = readState(text)
    expect(r).toEqual({ mode: 'rw', state: s, warnings: [] })
    expect(writeState(r.mode === 'rw' ? r.state : s)).toBe(text)
  })

  it('treats a missing file as an empty writable state', () => {
    expect(readState(null)).toEqual({ mode: 'rw', state: { schema: 1, installs: [] }, warnings: [] })
  })

  it('reads an unknown schema as read-only with a warning', () => {
    const r = readState(JSON.stringify({ schema: 2, installs: [], extra: true }))
    expect(r.mode).toBe('readonly')
    if (r.mode === 'readonly') {
      expect(r.schema).toBe(2)
      expect(r.warnings[0]).toMatch(/schema 2/)
    }
  })

  it('rejects bad JSON, unknown keys and malformed hashes', () => {
    expect(readState('{not json')).toEqual({ mode: 'invalid', errors: ['state.json is not valid JSON'] })
    const extraKey = JSON.parse(writeState(withOne()))
    extraKey.installs[0].surprise = 1
    const r1 = readState(JSON.stringify(extraKey))
    expect(r1.mode).toBe('invalid')
    const badHash = JSON.parse(writeState(withOne()))
    badHash.installs[0].files[0].sha256 = 'XYZ'
    const r2 = readState(JSON.stringify(badHash))
    expect(r2.mode === 'invalid' && r2.errors.some((e) => e.startsWith('installs.0.files.0.sha256'))).toBe(true)
  })

  it('rejects a non-https git source and an unknown scope', () => {
    const bad = { ...install(), source: { kind: 'git', url: 'http://x.example/p', commit: 'abc123f' } }
    expect(() => upsertInstall(emptyState(), bad as PackInstall)).toThrow()
    expect(() => upsertInstall(emptyState(), { ...install(), scope: 'machine' } as unknown as PackInstall)).toThrow()
  })

  it('replaces an install with the same packId, scope and root, and keeps other roots', () => {
    const s1 = upsertInstall(withOne(), install({ root: '/home/u/other' }))
    const s2 = upsertInstall(s1, install({ hostsApproved: [] }))
    expect(s2.installs).toHaveLength(2)
    expect(findInstall(s2, key)?.hostsApproved).toEqual([])
    expect(findInstall(s2, { ...key, scope: 'global' })).toBeUndefined()
  })

  it('removes only the matching install and does not change the input', () => {
    const s = withOne()
    const after = removeInstall(s, key)
    expect(after.installs).toEqual([])
    expect(s.installs).toHaveLength(1)
  })

  it('moves to a new version and keeps the old one as previous', () => {
    const s = recordUpdate(withOne(), key, { ...install(), version: '1.3.0' })
    const cur = findInstall(s, key)
    expect(cur?.version).toBe('1.3.0')
    expect(cur?.previous).toBe('1.2.0')
  })

  it('rolls back to the previous version and clears previous', () => {
    const s = recordRollback(withOne(), key, { ...install(), version: '1.1.0' })
    expect(findInstall(s, key)).toMatchObject({ version: '1.1.0', previous: null })
  })

  it('refuses a rollback to a version that is not the recorded previous one', () => {
    expect(() => recordRollback(withOne(), key, { ...install(), version: '1.0.0' })).toThrow(/not the previous/)
    expect(() => recordUpdate(emptyState(), key, install())).toThrow(/no install/)
  })
})
