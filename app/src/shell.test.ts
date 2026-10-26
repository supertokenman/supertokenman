import { describe, expect, it } from 'vitest'
import { looksLikeCommand } from './Panel'
import { forClaude } from './ShellBlock'

describe('shell in the composer', () => {
  it('spots commands, not questions', () => {
    expect(looksLikeCommand('git status')).toBe(true)
    expect(looksLikeCommand('npm test -- --watch')).toBe(true)
    expect(looksLikeCommand('how does git rebase work?')).toBe(false)
    expect(looksLikeCommand('github is down?')).toBe(false)
  })

  it('cuts long output in the middle before it goes to Claude', () => {
    const text = forClaude({ kind: 'shell', id: 's', command: 'npm test', out: 'a'.repeat(5000) + 'b'.repeat(5000), code: 1, ms: 10, running: false })
    expect(text).toContain('$ npm test')
    expect(text).toContain('Exit code 1')
    expect(text).toContain('2000 characters cut')
    expect(text.length).toBeLessThan(8400)
  })
})
