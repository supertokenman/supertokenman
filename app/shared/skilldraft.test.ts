import { describe, expect, it } from 'vitest'
import { checkDraft, draftOf, nameOf, polishLost, skillMd, stepsOf } from './skilldraft'

const turns = [
  { prompt: 'Please add a migration for the orders table and run the tests', reply: 'Added 0003_orders.sql.\nAll tests pass.', tools: [
    { name: 'Read', summary: 'db/schema.sql' }, { name: 'Read', summary: 'db/0002.sql' }, { name: 'Write', summary: 'db/0003_orders.sql' },
    { name: 'Bash', summary: 'npm test' }, { name: 'Edit', summary: 'db/0003_orders.sql' }, { name: 'Bash', summary: 'npm test' }, { name: 'mcp__acme-db__list_tables', summary: '' },
  ] },
]

describe('skill drafts', () => {
  it('names from the ask', () => {
    expect(nameOf('Please add a migration for the orders table')).toBe('add-migration-orders-table')
    expect(nameOf('???')).toBe('learned-task')
  })
  it('turns tool calls into steps and checks', () => {
    const s = stepsOf(turns)
    expect(s.steps).toEqual([
      'Look at the relevant code first (for example db/schema.sql).',
      'Make the change in db/0003_orders.sql.',
      'Run `npm test` and fix what it reports.',
      'Make the change in db/0003_orders.sql.',
      'Run `npm test` and fix what it reports.',
      'Use the acme-db tool list_tables.',
    ])
    expect(s.checks).toEqual(['npm test'])
    expect(s.files).toEqual(['db/0003_orders.sql'])
  })
  it('drafts a valid skill and refuses secrets', () => {
    const d = draftOf(turns, { project: 'shop', date: '2026-10-25' })
    expect(d.name).toBe('add-migration-orders-table')
    expect(d.description).toMatch(/^Use when asked to add a migration for the orders table and run the tests\. Learned from a task done in shop\.$/)
    expect(d.body).toContain('## Checks before saying it is done\n- `npm test` passes.')
    expect(checkDraft(d)).toBeNull()
    expect(skillMd(d)).toMatch(/^---\nname: add-migration-orders-table\ndescription: "Use when/)
    expect(checkDraft({ ...d, body: d.body + '\nexport KEY=sk-ant-abcdefghijklmnop' })).toMatch(/key or token/)
    expect(checkDraft({ ...d, name: 'Bad Name' })).toMatch(/lowercase/)
  })
  it('refuses a polish that loses what happened', () => {
    const before = '## Steps\n1. Run `npm test` and fix what it reports.\n2. Make the change in db/x.sql, the file with the orders table.'
    expect(polishLost(before, 'feat: add model servers')).toMatch(/dropped `npm test`/)
    expect(polishLost(before, '## Steps\n1. Run `npm test`; fix failures.\n2. Edit the migration in db/x.sql for the orders table, then re-run.')).toBeNull()
  })
})
