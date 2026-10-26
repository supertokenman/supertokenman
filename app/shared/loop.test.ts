import { describe, expect, it } from 'vitest'
import { LoopWatch } from './loop'

describe('loop watch', () => {
  it('stops on the same call three times in a short run', () => {
    const w = new LoopWatch()
    expect(w.tool('Bash', 'npm test')).toBeNull()
    expect(w.tool('Read', 'src/a.ts')).toBeNull()
    expect(w.tool('Bash', 'npm test')).toBeNull()
    expect(w.tool('Bash', 'npm  test')).toMatch(/Bash ran 3 times/)
  })
  it('does not count calls that differ, nor ones far apart', () => {
    const w = new LoopWatch()
    for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) expect(w.tool('Read', f)).toBeNull()
    w.tool('Bash', 'ls')
    for (const f of ['1x', '2x', '3x', '4x', '5x']) w.tool('Read', `file-${f}-other`.replace(/\d/, 'n' + f))
    expect(w.tool('Bash', 'ls')).toBeNull()
  })
  it('stops on the same error three times in a row, numbers aside', () => {
    const w = new LoopWatch()
    expect(w.error('Error: port 3000 in use')).toBeNull()
    expect(w.error('Error: port 3001 in use')).toBeNull()
    expect(w.error('Error: port 3002 in use\nat x')).toMatch(/same error came back 3 times/)
  })
  it('forgets on a new message', () => {
    const w = new LoopWatch()
    w.tool('Bash', 'x')
    w.tool('Bash', 'x')
    w.reset()
    expect(w.tool('Bash', 'x')).toBeNull()
  })
})
