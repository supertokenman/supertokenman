import { describe, expect, it } from 'vitest'
import { EXAMPLE_PLAYBOOK, parsePlaybook, stepPrompt } from './playbook'

describe('playbook', () => {
  it('reads the example', () => {
    const p = parsePlaybook(EXAMPLE_PLAYBOOK)
    expect(p.name).toBe('Upgrade a dependency')
    expect(p.steps).toHaveLength(3)
    expect(p.steps[0]).toEqual({ name: 'Bump it', prompt: 'Upgrade the package named in the goal to its latest minor version.\nChange only package.json and the lockfile.', check: 'npm test', checkpoint: false })
    expect(p.steps[1]!.checkpoint).toBe(true)
    expect(p.steps[2]!.check).toBeUndefined()
  })
  it('reads skills, quotes, folded text and comments', () => {
    const p = parsePlaybook(`# a comment\nname: "Release"\ndescription: >\n  Cut a release\n  and tag it.\nsteps:\n  - skill: release-notes\n    check: 'npm run lint' # inline\n  - name: Tag\n    prompt: Tag it.\n`)
    expect(p.description).toBe('Cut a release and tag it.')
    expect(p.steps[0]).toMatchObject({ name: 'Step 1', skill: 'release-notes', check: 'npm run lint' })
  })
  it('says what is wrong, with the line', () => {
    expect(() => parsePlaybook('steps:\n  - prompt: x')).toThrow(/name/)
    expect(() => parsePlaybook('name: x')).toThrow(/steps/)
    expect(() => parsePlaybook('name: x\nsteps:\n  - name: a')).toThrow(/Step 1 needs/)
    expect(() => parsePlaybook('name: x\n  oops')).toThrow(/Line 2/)
  })
  it('writes the step prompt and the fix prompt', () => {
    const p = parsePlaybook(EXAMPLE_PLAYBOOK)
    expect(stepPrompt(p, 0)).toMatch(/step 1 of 3: Bump it[\s\S]*npm test` must pass/)
    expect(stepPrompt(p, 1, { check: 'npm test', out: 'FAIL a.test.ts' })).toMatch(/failed after this step[\s\S]*FAIL a.test.ts/)
  })
})
