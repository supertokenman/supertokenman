import { describe, expect, it } from 'vitest'
import { planInstall, rulesUpsert, targetOf, type FsEntry, type PlanManifest, type PlanOpts, type PlanState } from './packplan.js'

const manifest: PlanManifest = {
  id: 'pg-helper',
  version: '1.2.0',
  files: [
    { from: 'skills/q/SKILL.md', to: '.claude/skills/pg-helper/q/SKILL.md', kind: 'skill' },
    { from: 'notes.txt', to: '.claude/packs/pg-helper/notes.txt', kind: 'file' },
  ],
  rules: { text: 'Prefer EXPLAIN ANALYZE.' },
}
const hashes = { 'skills/q/SKILL.md': 'h1', 'notes.txt': 'h2' }
const empty: PlanState = { installs: [] }
const opts = (o: Partial<PlanOpts> = {}): PlanOpts => ({
  scope: 'project', root: '/w/app', source: { kind: 'folder', path: '/packs/pg' }, hashes, rulesSha256: 'r1', now: 5, ...o,
})

describe('planInstall', () => {
  it('orders mkdir (shallow first), writes, rules, then state record', () => {
    const p = planInstall(manifest, new Map(), empty, opts())
    expect(p.blocked).toBe(false)
    expect(p.errors).toEqual([])
    expect(p.ops.map(o => o.op)).toEqual(['mkdir', 'mkdir', 'mkdir', 'mkdir', 'mkdir', 'mkdir', 'write', 'write', 'rulesUpsert', 'stateRecord'])
    expect(p.ops[0]).toEqual({ op: 'mkdir', path: '.claude' })
    const rec = p.ops[p.ops.length - 1]
    expect(rec).toMatchObject({ op: 'stateRecord', record: { packId: 'pg-helper', version: '1.2.0', previous: null, rulesSha256: 'r1', installedAt: 5 } })
  })

  it('skips mkdir for directories that already exist', () => {
    const existing = new Map<string, FsEntry>([['.claude', { type: 'dir' }], ['.claude/skills', { type: 'dir' }]])
    const p = planInstall(manifest, existing, empty, opts())
    const dirs = p.ops.filter(o => o.op === 'mkdir').map(o => (o as { path: string }).path)
    expect(dirs).not.toContain('.claude')
    expect(dirs).not.toContain('.claude/skills')
    expect(dirs).toContain('.claude/skills/pg-helper')
  })

  it('reports an existing file as a blocking conflict until a decision is given', () => {
    const existing = new Map<string, FsEntry>([['.claude/skills/pg-helper/q/SKILL.md', { type: 'file' }]])
    const p = planInstall(manifest, existing, empty, opts())
    expect(p.conflicts).toEqual([{ to: '.claude/skills/pg-helper/q/SKILL.md', reason: 'exists', overwritable: true }])
    expect(p.blocked).toBe(true)
    expect(p.ops.some(o => o.op === 'stateRecord')).toBe(false)
  })

  it('skip drops the write and unblocks; the file is not recorded', () => {
    const existing = new Map<string, FsEntry>([['.claude/skills/pg-helper/q/SKILL.md', { type: 'file' }]])
    const p = planInstall(manifest, existing, empty, opts({ decisions: { '.claude/skills/pg-helper/q/SKILL.md': 'skip' } }))
    expect(p.blocked).toBe(false)
    const writes = p.ops.filter(o => o.op === 'write')
    expect(writes.map(w => (w as { to: string }).to)).toEqual(['.claude/packs/pg-helper/notes.txt'])
    const rec = p.ops.find(o => o.op === 'stateRecord') as { record: { files: { to: string }[] } }
    expect(rec.record.files.map(f => f.to)).toEqual(['.claude/packs/pg-helper/notes.txt'])
  })

  it('overwrite keeps the write with a backup flag', () => {
    const existing = new Map<string, FsEntry>([['.claude/skills/pg-helper/q/SKILL.md', { type: 'file' }]])
    const p = planInstall(manifest, existing, empty, opts({ decisions: { '.claude/skills/pg-helper/q/SKILL.md': 'overwrite' } }))
    expect(p.blocked).toBe(false)
    expect(p.ops).toContainEqual({ op: 'write', to: '.claude/skills/pg-helper/q/SKILL.md', from: 'skills/q/SKILL.md', sha256: 'h1', backup: true })
  })

  it('a symlink on the target or any ancestor is never overwritable', () => {
    const onTarget = new Map<string, FsEntry>([['.claude/packs/pg-helper/notes.txt', { type: 'symlink' }]])
    const p1 = planInstall(manifest, onTarget, empty, opts({ decisions: { '.claude/packs/pg-helper/notes.txt': 'overwrite' } }))
    expect(p1.conflicts[0]).toEqual({ to: '.claude/packs/pg-helper/notes.txt', reason: 'symlink', overwritable: false })
    expect(p1.blocked).toBe(true)

    const onAncestor = new Map<string, FsEntry>([['.claude/packs', { type: 'symlink' }]])
    const p2 = planInstall(manifest, onAncestor, empty, opts())
    expect(p2.conflicts.map(c => c.reason)).toEqual(['symlink'])
    expect(p2.blocked).toBe(true)
  })

  it('a directory where a file goes is a non-overwritable conflict', () => {
    const existing = new Map<string, FsEntry>([['.claude/packs/pg-helper/notes.txt', { type: 'dir' }]])
    const p = planInstall(manifest, existing, empty, opts({ decisions: { '.claude/packs/pg-helper/notes.txt': 'overwrite' } }))
    expect(p.conflicts[0]).toMatchObject({ reason: 'not-a-file', overwritable: false })
    expect(p.blocked).toBe(true)
  })

  it('refuses when the same pack is already installed at this root', () => {
    const state: PlanState = { installs: [{ packId: 'pg-helper', scope: 'project', root: '/w/app', version: '1.1.0', previous: null, source: { kind: 'folder', path: '/packs/pg' }, installedAt: 1, files: [], rulesSha256: null, mcpEnabled: {}, hostsApproved: [] }] }
    const p = planInstall(manifest, new Map(), state, opts())
    expect(p.errors.length).toBe(1)
    expect(p.ops).toEqual([])
  })

  it('global scope drops the leading .claude/ from targets', () => {
    expect(targetOf('global', '.claude/skills/x/SKILL.md')).toBe('skills/x/SKILL.md')
    expect(targetOf('project', '.claude/skills/x/SKILL.md')).toBe('.claude/skills/x/SKILL.md')
    const p = planInstall(manifest, new Map(), empty, opts({ scope: 'global', root: '/home/u/.claude' }))
    expect(p.ops).toContainEqual({ op: 'write', to: 'skills/pg-helper/q/SKILL.md', from: 'skills/q/SKILL.md', sha256: 'h1', backup: false })
  })

  it('rejects unsafe or out-of-folder targets with an error and no ops', () => {
    for (const to of ['../evil.txt', '/etc/passwd', '.claude/skills/other-pack/x.md', 'CLAUDE.md', '.mcp.json']) {
      const m: PlanManifest = { ...manifest, files: [{ from: 'notes.txt', to, kind: 'file' }], rules: undefined }
      const p = planInstall(m, new Map(), empty, opts())
      expect(p.errors.length, to).toBe(1)
      expect(p.errors[0]).toContain(to)
      expect(p.ops, to).toEqual([])
    }
  })

  it('reports a missing source hash as an error', () => {
    const p = planInstall(manifest, new Map(), empty, opts({ hashes: { 'notes.txt': 'h2' } }))
    expect(p.errors).toEqual(['no hash for skills/q/SKILL.md'])
  })

  it('no rules means no rulesUpsert op and null rulesSha256', () => {
    const p = planInstall({ ...manifest, rules: undefined }, new Map(), empty, opts())
    expect(p.ops.some(o => o.op === 'rulesUpsert')).toBe(false)
    expect(p.ops.find(o => o.op === 'stateRecord')).toMatchObject({ record: { rulesSha256: null } })
  })
})

describe('rulesUpsert', () => {
  const block = (v: string, body: string) => `<!-- stm-pack:pg-helper v${v} start -->\n${body}\n<!-- stm-pack:pg-helper end -->`

  it('appends a block to existing text with a blank line between', () => {
    expect(rulesUpsert('# Project\n', 'pg-helper', '1.2.0', 'Rule.')).toBe('# Project\n\n' + block('1.2.0', 'Rule.') + '\n')
  })

  it('creates the file content when empty', () => {
    expect(rulesUpsert('', 'pg-helper', '1.2.0', 'Rule.')).toBe(block('1.2.0', 'Rule.') + '\n')
  })

  it('is idempotent when applied twice', () => {
    const once = rulesUpsert('# P\n', 'pg-helper', '1.2.0', 'Rule.')
    expect(rulesUpsert(once, 'pg-helper', '1.2.0', 'Rule.')).toBe(once)
  })

  it('replaces the block in place on a new version and keeps surrounding text', () => {
    const start = '# P\n\n' + block('1.0.0', 'Old.') + '\n\n## After\n'
    const out = rulesUpsert(start, 'pg-helper', '1.2.0', 'New.')
    expect(out).toBe('# P\n\n' + block('1.2.0', 'New.') + '\n\n## After\n')
    expect(out).not.toContain('Old.')
  })

  it('leaves other packs blocks alone', () => {
    const other = '<!-- stm-pack:other v1.0.0 start -->\nX\n<!-- stm-pack:other end -->\n'
    const out = rulesUpsert(other, 'pg-helper', '1.2.0', 'Rule.')
    expect(out.startsWith(other)).toBe(true)
  })
})
