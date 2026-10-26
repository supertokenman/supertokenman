import { describe, expect, it } from 'vitest'
import { clashes, entryFor, keptOf, parseItems, prompt } from './reflect'

const NOTE = `# acme

State, decisions and next steps.

## 2026-09-02 Decision: we use pnpm for the monorepo

Why: workspaces and a strict lockfile.

## 2026-09-10 Fact: the API listens on port 8787

Confidence: high.
`

describe('session reflection', () => {
  it('reads kept entries from the project note', () => {
    const k = keptOf(NOTE)
    expect(k.map((x) => x.date)).toEqual(['2026-09-02', '2026-09-10'])
    expect(k[0]!.title).toBe('Decision: we use pnpm for the monorepo')
    expect(k[1]!.text).toBe('Confidence: high.')
  })
  it('parses the draft and drops what is malformed or repeated', () => {
    const items = parseItems('Here:\n[{"kind":"decision","text":"We migrated to bun for installs","confidence":"high","why":"faster CI"},{"kind":"Fact","text":"Seeds live in db/seed.sql","confidence":"weird"},{"kind":"opinion","text":"x is nice"},{"kind":"decision","text":"We migrated to bun for installs","confidence":"low"}]')
    expect(items).toEqual([
      { kind: 'decision', text: 'We migrated to bun for installs', confidence: 'high', why: 'faster CI' },
      { kind: 'fact', text: 'Seeds live in db/seed.sql', confidence: 'medium' },
    ])
    expect(parseItems('no json here')).toEqual([])
  })
  it('marks "we use pnpm" against "we migrated to bun" with both sides', () => {
    const kept = keptOf(NOTE)
    const c = clashes({ kind: 'decision', text: 'We migrated from pnpm to bun for installs', confidence: 'high' }, kept)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ topic: 'package manager', was: 'pnpm', now: 'bun', old: { date: '2026-09-02' } })
    expect(clashes({ kind: 'fact', text: 'We still use pnpm workspaces', confidence: 'high' }, kept)).toEqual([])
    expect(clashes({ kind: 'lesson', text: 'bun broke the lockfile once', confidence: 'low' }, kept)).toEqual([])
  })
  it('writes an entry that names what it replaces, and the prompt carries what is kept', () => {
    const kept = keptOf(NOTE)
    const item = { kind: 'decision' as const, text: 'Use bun for installs', confidence: 'high' as const }
    const e = entryFor(item, clashes(item, kept))
    expect(e.title).toBe('Decision: Use bun for installs')
    expect(e.text).toContain('Replaces: "Decision: we use pnpm for the monorepo" from 2026-09-02 (package manager: pnpm → bun).')
    expect(prompt('did things', kept)).toContain('2026-09-02 Decision: we use pnpm')
    expect(prompt('did things', kept)).toMatch(/No notes about people/)
  })
})
