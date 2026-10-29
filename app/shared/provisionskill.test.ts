import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAP_TOOLS } from './capcard'

const dir = join(__dirname, '..', 'resources', 'skills', 'supertokenman')
const files = ['SKILL.md', 'references/workflows.md', 'references/roles.md', 'references/team-bundle.md']

describe('the supertokenman skill', () => {
  it('has the header Claude Code reads', () => {
    const head = /^---\nname: supertokenman\ndescription: (.+)\n---\n/.exec(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
    expect(head?.[1]).toBeTruthy()
  })
  it('names only stm tools the app has', () => {
    for (const f of files) {
      for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/mcp__stm__\w+/g)) expect(CAP_TOOLS as readonly string[]).toContain(m[0])
    }
  })
  it('uses team_plan then team_provision as the main flow, with stm team import as the terminal way', () => {
    const t = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    expect(t.indexOf('mcp__stm__team_plan')).toBeGreaterThan(-1)
    expect(t.indexOf('mcp__stm__team_plan')).toBeLessThan(t.indexOf('mcp__stm__team_provision'))
    expect(t).toContain('stm team import')
    expect(t).not.toMatch(/no `?team_plan`?/i)
  })
})
