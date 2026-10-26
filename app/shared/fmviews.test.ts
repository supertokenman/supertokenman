import { describe, expect, it } from 'vitest'
import { board, filter, parseFrontmatter, setField, type Note } from './fmviews'

const md = `---
title: Ship Pix
type: task
status: doing
tags:
  - payments
  - "q4"
due: 2026-11-02
---
# Ship Pix
Body stays.
`

describe('frontmatter views', () => {
  it('reads scalars and lists', () => {
    expect(parseFrontmatter(md).data).toEqual({ title: 'Ship Pix', type: 'task', status: 'doing', tags: ['payments', 'q4'], due: '2026-11-02' })
    expect(parseFrontmatter('no front').data).toEqual({})
    expect(parseFrontmatter('---\ntags: [a, "b c"]\n---\n').data.tags).toEqual(['a', 'b c'])
  })
  it('sets one field and leaves every other line alone', () => {
    const out = setField(md, 'status', 'done')
    expect(out).toBe(md.replace('status: doing', 'status: done'))
    expect(setField(md, 'tags', 'one')).toContain('tags: one\ndue:')
    expect(setField('# plain', 'status', 'todo')).toBe('---\nstatus: todo\n---\n# plain')
    expect(setField(md, 'owner', 'needs: quote')).toContain('owner: "needs: quote"')
    expect(() => setField(md, 'bad key', 'x')).toThrow()
  })
  const notes: Note[] = [
    { file: 'a.md', title: 'Ship Pix', data: { type: 'task', status: 'doing', tags: ['payments'] } },
    { file: 'b.md', title: 'Write docs', data: { type: 'task', status: 'todo' } },
    { file: 'c.md', title: 'Meeting notes', data: { type: 'note' } },
    { file: 'd.md', title: 'Fix login', data: { type: 'task' } },
  ]
  it('filters by fields and words', () => {
    expect(filter(notes, 'type=task').map((n) => n.file)).toEqual(['a.md', 'b.md', 'd.md'])
    expect(filter(notes, 'type=task status!=doing').map((n) => n.file)).toEqual(['b.md', 'd.md'])
    expect(filter(notes, 'has:status').map((n) => n.file)).toEqual(['a.md', 'b.md'])
    expect(filter(notes, 'missing:status type=task').map((n) => n.file)).toEqual(['d.md'])
    expect(filter(notes, 'tags=payments pix').map((n) => n.file)).toEqual(['a.md'])
  })
  it('groups a board, chosen order first, notes without the field last', () => {
    expect(board(filter(notes, 'type=task'), 'status', ['todo', 'doing', 'done']).map((c) => [c.column, c.notes.length])).toEqual([['todo', 1], ['doing', 1], ['done', 0], ['(none)', 1]])
  })
})
