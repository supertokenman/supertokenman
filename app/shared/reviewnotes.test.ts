import { describe, expect, it } from 'vitest'
import { addLesson, block, proposals } from './reviewnotes'

describe('learning from review notes', () => {
  let list = addLesson([], { project: 'api', text: 'Use pnpm here.', tool: 'Bash', at: 1 })
  list = addLesson(list, { project: 'api', text: 'use  PNPM here', tool: 'Bash', at: 3 })
  list = addLesson(list, { project: 'api', text: 'Do not edit generated files.', tool: 'Edit', at: 2 })
  list = addLesson(list, { project: 'web', text: 'Use pnpm here.', tool: 'Bash', at: 4 })
  list = addLesson(list, { project: 'api', text: 'no', tool: 'Bash', at: 5 })

  it('groups the same note per project, most repeated first, and drops near-empty ones', () => {
    const p = proposals(list, 'api')
    expect(p.map((x) => [x.line, x.count])).toEqual([['use PNPM here', 2], ['Do not edit generated files.', 1]])
    expect(proposals(list, 'api', 2)).toHaveLength(1)
  })
  it('writes only lines the file does not already have', () => {
    expect(block('# Rules\n- Use pnpm here\n', ['Use pnpm here.', 'Do not edit generated files.'], '2026-10-28')).toBe('\n## From review notes (2026-10-28)\n\n- Do not edit generated files.\n')
    expect(block('- use pnpm here', ['Use pnpm here.'], '2026-10-28')).toBe('')
  })
})
