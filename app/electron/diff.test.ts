import { describe, expect, it } from 'vitest'
import { compact, editOf, lineDiff } from './diff'

describe('diff', () => {
  it('diffs lines, keeping what both sides share', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { op: ' ', text: 'a' },
      { op: '-', text: 'b' },
      { op: '+', text: 'B' },
      { op: ' ', text: 'c' },
      { op: '+', text: 'd' },
    ])
  })

  it('folds long unchanged stretches', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l10', 'L10')
    const out = compact(lineDiff(before, after), 1)
    expect(out.map((l) => l.op + l.text)).toEqual([' ... 9 unchanged lines', ' l9', '-l10', '+L10', ' l11', ' ... 8 unchanged lines'])
  })

  it('reads Edit, MultiEdit and Write calls; a Write compares with the file on disk', () => {
    const disk: Record<string, string> = { '/p/a.ts': 'x\ny' }
    const read = (f: string) => disk[f] ?? null
    expect(editOf('1', 'Edit', { file_path: '/p/a.ts', old_string: 'y', new_string: 'z' }, read)).toMatchObject({ file: '/p/a.ts', added: 1, removed: 1, isNew: false })
    expect(editOf('2', 'MultiEdit', { file_path: '/p/a.ts', edits: [{ old_string: 'x', new_string: 'X' }, { old_string: 'y', new_string: 'Y' }] }, read)?.lines.map((l) => l.op)).toEqual(['-', '+', ' ', '-', '+'])
    expect(editOf('3', 'Write', { file_path: '/p/a.ts', content: 'x\ny\nz' }, read)).toMatchObject({ added: 1, removed: 0, isNew: false })
    expect(editOf('4', 'Write', { file_path: '/p/new.ts', content: 'hi' }, read)).toMatchObject({ added: 1, isNew: true })
    expect(editOf('5', 'Bash', { command: 'ls' }, read)).toBeNull()
  })
})
