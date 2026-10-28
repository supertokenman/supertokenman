import { describe, expect, it } from 'vitest'
import { claimOf, evidenceOf, evidenceText } from './evidence'

const bash = (summary: string) => ({ name: 'Bash', summary })
const edit = { name: 'Edit', summary: 'src/a.ts' }

describe('evidence on claims', () => {
  it('finds the sentence that claims, and ignores the Not verified list', () => {
    expect(claimOf('I looked at it. The login bug is fixed now. Next: deploy.')).toBe('The login bug is fixed now')
    expect(claimOf('Here is the plan.')).toBeNull()
    expect(claimOf('Done.\n\nNot verified\n- that the build passes')).toBeNull()
  })
  it('marks observed when a check ran after the last edit', () => {
    const e = evidenceOf('Fixed. Tests pass.', [edit, bash('npm test')])
    expect(e?.level).toBe('observed')
    expect(evidenceText(e!)).toMatch(/npm test ran in this turn/)
  })
  it('marks stale when files changed after the check, inferred when no check ran', () => {
    expect(evidenceOf('It works now.', [bash('npx vitest run'), edit])?.level).toBe('stale')
    expect(evidenceOf('This is faster.', [edit, bash('ls -la')])?.level).toBe('inferred')
    expect(evidenceOf('Corrigido.', [edit])?.level).toBe('inferred')
  })
  it('knows common checks across stacks', () => {
    for (const c of ['pnpm run typecheck', 'cargo test', 'go test ./...', 'pytest -q', 'hyperfine "node a"', 'cd app && npm run build'])
      expect(evidenceOf('Fixed.', [bash(c)])?.level).toBe('observed')
  })
})
