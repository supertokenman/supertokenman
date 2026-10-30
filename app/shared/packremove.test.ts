import { describe, expect, it } from 'vitest'
import { planRemove, type RemoveInput } from './packremove'

const hash = (s: string) => `h:${s}`
const block = (body: string) => `<!-- stm-pack:demo v1.0.0 start -->\n${body}\n<!-- stm-pack:demo end -->`
const base = (over: Partial<RemoveInput> = {}): RemoveInput => ({
  packId: 'demo',
  files: [
    { to: '.claude/skills/demo/a/SKILL.md', sha256: 'A' },
    { to: '.claude/skills/demo/b/SKILL.md', sha256: 'B' },
  ],
  disk: { '.claude/skills/demo/a/SKILL.md': 'A', '.claude/skills/demo/b/SKILL.md': 'changed' },
  claudeMd: null,
  dirs: {
    '.claude/skills/demo/a': ['.claude/skills/demo/a/SKILL.md'],
    '.claude/skills/demo/b': ['.claude/skills/demo/b/SKILL.md'],
    '.claude/skills/demo': ['.claude/skills/demo/a', '.claude/skills/demo/b'],
  },
  ...over,
})
const keep = { keepEdited: true }

describe('uninstall plan', () => {
  it('deletes unedited files and keeps edited ones by default', () => {
    const p = planRemove(base(), keep, hash)
    expect(p.delete).toEqual(['.claude/skills/demo/a/SKILL.md'])
    expect(p.kept).toEqual([{ to: '.claude/skills/demo/b/SKILL.md', reason: 'edited' }])
    expect(p.dirs).toEqual(['.claude/skills/demo/a']) // b still holds the edited file, so demo stays
  })

  it('deletes edited files too when keepEdited is off', () => {
    const p = planRemove(base(), { keepEdited: false }, hash)
    expect(p.delete).toEqual(['.claude/skills/demo/a/SKILL.md', '.claude/skills/demo/b/SKILL.md'])
    expect(p.kept).toEqual([])
    expect(p.dirs).toEqual(['.claude/skills/demo/a', '.claude/skills/demo/b', '.claude/skills/demo'])
  })

  it('reports a file the user deleted without listing it for deletion', () => {
    const p = planRemove(base({ disk: { '.claude/skills/demo/a/SKILL.md': 'A' } }), keep, hash)
    expect(p.kept).toContainEqual({ to: '.claude/skills/demo/b/SKILL.md', reason: 'missing' })
    expect(p.delete).toEqual(['.claude/skills/demo/a/SKILL.md'])
  })

  it('never lists a state entry outside the pack folders', () => {
    const p = planRemove(
      base({ files: [{ to: 'CLAUDE.md', sha256: 'X' }, { to: '.claude/skills/demo/../other/x', sha256: 'X' }], disk: { 'CLAUDE.md': 'X' } }),
      keep,
      hash,
    )
    expect(p.delete).toEqual([])
    expect(p.kept.map(k => k.reason)).toEqual(['outside', 'outside'])
  })

  it('leaves foreign files alone, so their folder stays', () => {
    const p = planRemove(
      base({
        files: [{ to: '.claude/skills/demo/a/SKILL.md', sha256: 'A' }],
        disk: { '.claude/skills/demo/a/SKILL.md': 'A' },
        dirs: {
          '.claude/skills/demo/a': ['.claude/skills/demo/a/SKILL.md', '.claude/skills/demo/a/notes.md'],
          '.claude/skills/demo': ['.claude/skills/demo/a'],
        },
      }),
      keep,
      hash,
    )
    expect(p.delete).toEqual(['.claude/skills/demo/a/SKILL.md'])
    expect(p.dirs).toEqual([])
  })

  it('lists empty folders deepest first and skips folders it cannot see', () => {
    const p = planRemove(
      base({ files: [{ to: '.claude/packs/demo/x/y/f.md', sha256: 'F' }], disk: { '.claude/packs/demo/x/y/f.md': 'F' }, dirs: {
        '.claude/packs/demo/x/y': ['.claude/packs/demo/x/y/f.md'],
        '.claude/packs/demo/x': ['.claude/packs/demo/x/y'],
      } }),
      keep,
      hash,
    )
    expect(p.dirs).toEqual(['.claude/packs/demo/x/y', '.claude/packs/demo/x'])
  })

  describe('CLAUDE.md marker block', () => {
    const rulesSha256 = hash('Use EXPLAIN.')

    it('removes an unedited block and keeps the text around it', () => {
      const text = `# Mine\n\n${block('Use EXPLAIN.')}\n\nMore.`
      const p = planRemove(base({ rulesSha256, claudeMd: text }), keep, hash)
      expect(p.rules).toEqual({ action: 'remove', edited: false, text: '# Mine\n\n\nMore.' })
    })

    it('keeps an edited block by default and removes it when asked', () => {
      const text = block('Use EXPLAIN, edited.')
      const kept = planRemove(base({ rulesSha256, claudeMd: text }), keep, hash)
      expect(kept.rules).toEqual({ action: 'keep', edited: true, text })
      const gone = planRemove(base({ rulesSha256, claudeMd: text }), { keepEdited: false }, hash)
      expect(gone.rules).toEqual({ action: 'remove', edited: true, text: '' })
    })

    it('treats missing markers as user-removed', () => {
      const text = 'Use EXPLAIN.\n<!-- stm-pack:demo end -->'
      const p = planRemove(base({ rulesSha256, claudeMd: text }), keep, hash)
      expect(p.rules).toEqual({ action: 'none', edited: false, text })
    })

    it('does nothing when the pack wrote no rules or there is no file', () => {
      expect(planRemove(base({ claudeMd: block('x') }), keep, hash).rules.action).toBe('none')
      expect(planRemove(base({ rulesSha256, claudeMd: null }), keep, hash).rules).toEqual({ action: 'none', edited: false, text: null })
    })
  })
})
