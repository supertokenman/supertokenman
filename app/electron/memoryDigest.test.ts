import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decisions, digest, projectMemory, rememberDecisions } from './memory'

const line = (o: object) => JSON.stringify(o)

describe('digest', () => {
  it('keeps the asks, the edited files and the last answer', () => {
    const t = [
      line({ type: 'user', message: { content: 'fix the login bug' } }),
      line({ type: 'user', isMeta: true, message: { content: 'caveat' } }),
      line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/p/auth.ts' } }] } }),
      line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
      line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Fixed: the token expired.' }] } }),
      line({ type: 'user', message: { content: '[Message from the "ops" panel of this app. Do it.]\n\ncheck the deploy' } }),
      'not json',
    ].join('\n')
    const d = digest(t)
    expect(d).toContain('- fix the login bug')
    expect(d).toContain('- /p/auth.ts')
    expect(d).toContain('Fixed: the token expired.')
    expect(d).not.toContain('caveat')
    expect(d).toContain('- check the deploy')
  })
  it('is empty for an empty conversation', () => expect(digest('')).toBe(''))
})

describe('projectMemory', () => {
  it('reads the tail of the note, starting at an entry', () => {
    const v = mkdtempSync(join(tmpdir(), 'vault-'))
    mkdirSync(join(v, 'projects'))
    writeFileSync(join(v, 'projects', 'app.md'), `# app\n\n## 2026-01-01 old\n\n${'x'.repeat(200)}\n\n## 2026-02-01 new\n\nlatest`)
    expect(projectMemory(v, 'app', 60)).toMatch(/^## 2026-02-01 new/)
    expect(projectMemory(v, 'none')).toBe('')
    expect(projectMemory('', 'app')).toBe('')
  })
})

describe('decisions', () => {
  it('reads the marked lines, with or without a reason', () => {
    expect(decisions('Done.\n\nDecision: use D1 instead of KV because queries need joins.\n**Decision:** keep `r2.dev` for dev only')).toEqual([
      { what: 'use D1 instead of KV', why: 'queries need joins.' },
      { what: 'keep r2.dev for dev only', why: '' },
    ])
    expect(decisions('We need a decision: later.')).toEqual([])
  })
  it('saves each decision once', () => {
    const v = mkdtempSync(join(tmpdir(), 'vault-'))
    const d = [{ what: 'use D1', why: 'joins' }]
    expect(rememberDecisions(v, 'app', d)).toBe(1)
    expect(rememberDecisions(v, 'app', d)).toBe(0)
    expect(projectMemory(v, 'app')).toContain('Why: joins')
  })
})

describe('docs', () => {
  it('reads and writes the note and CLAUDE.md where Claude looks for them', async () => {
    const { readDoc, writeDoc } = await import('./memory')
    const v = mkdtempSync(join(tmpdir(), 'vault-'))
    const cwd = mkdtempSync(join(tmpdir(), 'proj-'))
    expect(readDoc('claude', cwd, v)).toMatchObject({ exists: false, text: '' })
    writeDoc('claude', cwd, v, '# rules')
    expect(readDoc('claude', cwd, v).text).toBe('# rules\n')
    expect(writeDoc('note', cwd, v, 'state')).toContain(join(v, 'projects'))
    expect(() => readDoc('note', cwd, '')).toThrow(/vault/)
  })
})
