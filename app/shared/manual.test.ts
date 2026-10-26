import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fullGuide, lookup, MANUAL } from './manual'

describe('manual', () => {
  it('has unique section ids', () => {
    expect(new Set(MANUAL.map((s) => s.id)).size).toBe(MANUAL.length)
  })
  it('finds a section by id and by question', () => {
    expect(lookup('browse')[0]!.id).toBe('browse')
    expect(lookup('how do I connect notion?')[0]!.id).toBe('connections')
    expect(lookup('where are my keys kept, touch id?')[0]!.id).toBe('vault')
    expect(lookup('ollama is not working')[0]!.id).toBe('local')
    expect(lookup('what can you do for me?')[0]!.id).toBe('tour-me')
    expect(lookup('I restarted my computer, how do I get the context back?')[0]!.id).toBe('memory')
  })
  it('answers nothing for an empty question', () => {
    expect(lookup('  ')).toEqual([])
  })
  it('is written to docs/STM_GUIDE.md as it is now (run npm run guide)', () => {
    expect(readFileSync(join(__dirname, '..', '..', 'docs', 'STM_GUIDE.md'), 'utf8')).toBe(fullGuide())
  })
})
