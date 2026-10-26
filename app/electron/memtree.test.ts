import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripPrivate } from '../shared/private'
import { docTree, indexText, memoryNodes, noteEntries, readText } from './memtree'

const NOTE = `# app

State, decisions and next steps.

## 2026-10-20 Decision: use pnpm

Why: the monorepo already has a lockfile for it.

## 2026-10-22 Where we stopped

- Renamed the helper in src/util.ts
- Next: add a test

## 2026-10-23 Before auto compact

Asked:
- fix the login redirect
`

describe('memory tree', () => {
  it('reads a project note into entries with stable ids and kinds', () => {
    const a = noteEntries(NOTE, 'projects/app.md')
    expect(a.map((n) => [n.kind, n.date, n.title])).toEqual([
      ['decision', '2026-10-20', 'use pnpm'],
      ['stopped', '2026-10-22', 'Where we stopped'],
      ['summary', '2026-10-23', 'Before auto compact'],
    ])
    expect(a[0]!.summary).toBe('why: the monorepo already has a lockfile for it.')
    expect(noteEntries(NOTE, 'projects/app.md').map((n) => n.id)).toEqual(a.map((n) => n.id))
    expect(a[0]!.id).toMatch(/^[0-9a-f]{7}$/)
  })
  it('turns a document into a table of contents with one child per heading', () => {
    const t = docTree('# Spec\n\nIntro line.\n\n## Auth\n\nUse OAuth.\n\n## Billing\n\nMonthly plans.\n', 'docs/app/spec.md')
    expect(t.map((n) => [n.kind, n.title])).toEqual([['doc', 'Spec'], ['section', 'Auth'], ['section', 'Billing']])
    expect(t[1]!.parent).toBe(t[0]!.id)
    expect(t[0]!.summary).toBe('2 sections. Intro line.')
  })
  it('gives an index of one line each, newest first, and a query narrows it', () => {
    const nodes = noteEntries(NOTE, 'projects/app.md')
    const idx = indexText(nodes)
    expect(idx).toContain('Decisions:')
    expect(idx).toMatch(/- [0-9a-f]{7} 2026-10-20 use pnpm — why: the monorepo/)
    const q = indexText(nodes, 'login redirect')
    expect(q).toContain('Before auto compact')
    expect(q).not.toContain('use pnpm')
    expect(indexText(nodes, 'kubernetes')).toMatch(/Nothing in this project's memory matches/)
  })
  it('reads entries by id under their citation, and lists a document by its sections', () => {
    const nodes = [...noteEntries(NOTE, 'projects/app.md'), ...docTree('# Spec\n\n## Auth\n\nUse OAuth.\n', 'docs/app/spec.md')]
    const d = nodes.find((n) => n.kind === 'decision')!
    const doc = nodes.find((n) => n.kind === 'doc')!
    const r = readText(nodes, [d.id, doc.id, 'nope'])
    expect(r).toContain(`[mem:${d.id}] use pnpm (2026-10-20)`)
    expect(r).toMatch(/Sections:\n- [0-9a-f]{7} Auth — Use OAuth\./)
    expect(r).toContain('[mem:nope] not found.')
  })
  it('collects the note, session notes and documents of a project from the memory folder', () => {
    const v = mkdtempSync(join(tmpdir(), 'vault-'))
    mkdirSync(join(v, 'projects'))
    mkdirSync(join(v, 'sessions', 'app'), { recursive: true })
    mkdirSync(join(v, 'docs', 'app'), { recursive: true })
    writeFileSync(join(v, 'projects', 'app.md'), NOTE)
    writeFileSync(join(v, 'sessions', 'app', '2026-10-21-login.md'), '---\ndate: 2026-10-21T10:00\n---\n# Login fix\n\nFixed the redirect.\n')
    writeFileSync(join(v, 'docs', 'app', 'spec.md'), '# Spec\n\n## Auth\n\nUse OAuth.\n')
    const kinds = memoryNodes(v, 'app').map((n) => n.kind)
    expect(kinds).toEqual(['decision', 'stopped', 'summary', 'session', 'doc', 'section'])
    expect(memoryNodes(v, 'other')).toEqual([])
  })
  it('never keeps what is marked private', () => {
    expect(stripPrivate('deploy with <private>token abc123</private> today')).toBe('deploy with [private] today')
    expect(stripPrivate('a <PRIVATE>x\ny</PRIVATE> b <private>unclosed')).toBe('a [private] b [private]')
  })
  it('keeps one of identical entries and gives look-alikes their own ids', () => {
    const stop = '## 2026-10-24 Where we stopped\nReading the parser.\n'
    const twin = '## 2026-10-24 Where we stopped\nReading the parser.\n\nThen the tests.\n'
    const n = noteEntries(`# app\n\n${stop}\n${stop}\n${twin}`, 'projects/app.md')
    expect(n).toHaveLength(2)
    expect(new Set(n.map((x) => x.id)).size).toBe(2)
  })
})
