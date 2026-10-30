import { describe, expect, it } from 'vitest'
import { allowedTarget, inside, rejectSymlinks, safeRel } from './packpath'

const link = { isSymbolicLink: () => true }
const file = { isSymbolicLink: () => false }

describe('safeRel', () => {
  it('accepts plain relative paths', () => {
    expect(safeRel('skills/a/SKILL.md')).toEqual({ ok: true })
    expect(safeRel('a.txt')).toEqual({ ok: true })
  })
  it('rejects absolute paths', () => {
    expect(safeRel('/etc/passwd').ok).toBe(false)
  })
  it('rejects drive letters', () => {
    expect(safeRel('C:/x').ok).toBe(false)
    expect(safeRel('c:x').ok).toBe(false)
  })
  it('rejects home paths', () => {
    expect(safeRel('~/x').ok).toBe(false)
  })
  it('rejects .. and . segments', () => {
    expect(safeRel('a/../b').ok).toBe(false)
    expect(safeRel('..').ok).toBe(false)
    expect(safeRel('./a').ok).toBe(false)
  })
  it('rejects backslashes', () => {
    expect(safeRel('a\\b').ok).toBe(false)
  })
  it('rejects NUL and control characters', () => {
    expect(safeRel('a\u0000b').ok).toBe(false)
    expect(safeRel('a\nb').ok).toBe(false)
    expect(safeRel('a\u007fb').ok).toBe(false)
  })
  it('rejects empty paths and empty segments', () => {
    expect(safeRel('').ok).toBe(false)
    expect(safeRel('a//b').ok).toBe(false)
    expect(safeRel('a/').ok).toBe(false)
  })
  it('rejects names longer than 255', () => {
    expect(safeRel('a'.repeat(255)).ok).toBe(true)
    expect(safeRel('a'.repeat(256)).ok).toBe(false)
  })
})

describe('inside', () => {
  const root = '/home/u/proj'
  it('accepts descendants, relative or absolute', () => {
    expect(inside(root, 'a/b.txt')).toBe(true)
    expect(inside(root, '/home/u/proj/a/b.txt')).toBe(true)
  })
  it('rejects the root itself and empty input', () => {
    expect(inside(root, '')).toBe(false)
    expect(inside(root, '.')).toBe(false)
    expect(inside(root, '/home/u/proj')).toBe(false)
  })
  it('rejects escapes via ..', () => {
    expect(inside(root, '../x')).toBe(false)
    expect(inside(root, 'a/../../x')).toBe(false)
    expect(inside(root, '/home/u/other/x')).toBe(false)
  })
  it('rejects sibling prefixes', () => {
    expect(inside(root, '/home/u/proj2/x')).toBe(false)
  })
  it('allows .. that stays inside', () => {
    expect(inside(root, 'a/../b')).toBe(true)
  })
  it('rejects non-absolute roots, backslashes, NUL, drive letters, ~', () => {
    expect(inside('proj', 'a')).toBe(false)
    expect(inside(root, 'a\\b')).toBe(false)
    expect(inside(root, 'a\u0000')).toBe(false)
    expect(inside(root, 'C:/x')).toBe(false)
    expect(inside(root, '~/x')).toBe(false)
  })
})

describe('allowedTarget', () => {
  it('accepts files under the skill and pack folders', () => {
    expect(allowedTarget('postgres-helper', '.claude/skills/postgres-helper/SKILL.md')).toEqual({ ok: true })
    expect(allowedTarget('postgres-helper', '.claude/packs/postgres-helper/x.json')).toEqual({ ok: true })
  })
  it('rejects paths outside the pack folders', () => {
    expect(allowedTarget('postgres-helper', '.claude/skills/other/SKILL.md').ok).toBe(false)
    expect(allowedTarget('postgres-helper', '.claude/packs/other/x').ok).toBe(false)
    expect(allowedTarget('postgres-helper', 'src/x.ts').ok).toBe(false)
    expect(allowedTarget('postgres-helper', '.claude/skills/postgres-helper').ok).toBe(false)
  })
  it('rejects CLAUDE.md and .mcp.json', () => {
    expect(allowedTarget('postgres-helper', 'CLAUDE.md').ok).toBe(false)
    expect(allowedTarget('postgres-helper', '.mcp.json').ok).toBe(false)
  })
  it('rejects unsafe targets', () => {
    expect(allowedTarget('postgres-helper', '.claude/skills/postgres-helper/../../../x').ok).toBe(false)
    expect(allowedTarget('postgres-helper', '/.claude/skills/postgres-helper/x').ok).toBe(false)
    expect(allowedTarget('postgres-helper', '.claude\\skills\\postgres-helper\\x').ok).toBe(false)
  })
  it('rejects bad pack ids', () => {
    expect(allowedTarget('Bad_ID', '.claude/skills/Bad_ID/x').ok).toBe(false)
    expect(allowedTarget('a', '.claude/skills/a/x').ok).toBe(false)
    expect(allowedTarget('x/y', '.claude/skills/x/y/z').ok).toBe(false)
  })
})

describe('rejectSymlinks', () => {
  it('passes when no entry is a symlink', () => {
    expect(rejectSymlinks(new Map([['a', file], ['b', null], ['c', undefined]]))).toEqual({ ok: true })
  })
  it('rejects and names symlinks', () => {
    const r = rejectSymlinks(new Map([['a', file], ['link', link]]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('link')
  })
})
