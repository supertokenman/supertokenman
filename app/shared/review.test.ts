import { describe, expect, it } from 'vitest'
import { reviewMessage } from './review'

describe('review comments', () => {
  it('groups comments by file, with the line each sits on', () => {
    const m = reviewMessage(
      [
        { file: '/p/src/a.ts', op: '+', line: '  const x = any(y)', text: 'no any here' },
        { file: '/p/src/b.ts', op: '-', line: 'return cached', text: 'keep the cache' },
        { file: '/p/src/a.ts', op: ' ', line: 'export function f() {', text: 'rename to load' },
      ],
      '/p',
    )
    expect(m).toBe(
      [
        'Review of your changes: 3 comments. Address each, then say briefly what you changed.',
        '',
        'src/a.ts:',
        '- On the added line `const x = any(y)`: no any here',
        '- On the line `export function f() {`: rename to load',
        '',
        'src/b.ts:',
        '- On the removed line `return cached`: keep the cache',
      ].join('\n'),
    )
  })
  it('sends nothing for empty comments', () => {
    expect(reviewMessage([{ file: 'a', op: '+', line: 'x', text: '  ' }])).toBe('')
  })
})
