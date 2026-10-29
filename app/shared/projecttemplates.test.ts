import { describe, expect, it } from 'vitest'
import { fromMarkdown } from './personas'
import { planFiles, planSummary, PROJECT_TEMPLATES, projectTemplateById, templateFiles } from './projecttemplates'

describe('project templates', () => {
  it('each writes CLAUDE.md, its skills and a persona that reads back', () => {
    expect(PROJECT_TEMPLATES.length).toBeGreaterThanOrEqual(4)
    for (const t of PROJECT_TEMPLATES) {
      const fs = templateFiles(t)
      expect(fs[0]!.path).toBe('CLAUDE.md')
      expect(fs.filter((f) => f.path.endsWith('/SKILL.md'))).toHaveLength(t.skills.length)
      for (const s of t.skills) expect(fs.find((f) => f.path === `.claude/skills/${s.name}/SKILL.md`)!.text).toMatch(new RegExp(`^---\\nname: ${s.name}\\n`))
      const p = fs.at(-1)!
      expect(p.path).toBe(`.supertokenman/personas/${t.persona.id}.md`)
      expect(fromMarkdown(p.text).name).toBe(t.persona.name)
    }
  })
  it('keeps existing files unless picked to replace', () => {
    const fs = templateFiles(projectTemplateById('cli-tool')!)
    const r = planFiles(fs, (p) => p === 'CLAUDE.md')
    expect(r.skip).toEqual(['CLAUDE.md'])
    expect(r.write).toHaveLength(fs.length - 1)
    expect(planFiles(fs, () => true, ['CLAUDE.md']).write.map((f) => f.path)).toEqual(['CLAUDE.md'])
    expect(planSummary(r)).toBe(`Wrote ${fs.length - 1} files; kept 1 already there (CLAUDE.md).`)
  })
})
