import { describe, expect, it } from 'vitest'
import { condense, condensedResult, MIN_CHARS, skipCommand } from './condense'

const long = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('\n')

describe('condense', () => {
  it('passes a short output through untouched', () => {
    const r = condense('a\nb\nc')
    expect(r).toMatchObject({ text: 'a\nb\nc', changed: false })
  })
  it('keeps the head, the tail and an error with its context, and says how many lines were left out', () => {
    const raw = long(400, (i) => (i === 200 ? 'Error: boom in build' : `line ${i} of the build log`))
    const r = condense(raw)
    expect(r.changed).toBe(true)
    expect(r.text).toContain('line 0 of the build log')
    expect(r.text).toContain('Error: boom in build')
    expect(r.text).toContain('line 199 of the build log')
    expect(r.text).toContain('line 399 of the build log')
    expect(r.text).not.toContain('line 100 of the build log')
    expect(r.text).toMatch(/\[\d+ lines omitted\]/)
    expect(r.outLines).toBeLessThan(r.inLines)
  })
  it('drops colour codes, progress bars and collapses repeated lines', () => {
    const raw = `\x1b[31mred\x1b[0m\n${long(100, () => 'same line')}\n[=========>   ] 45%\ndone`
    const r = condense(raw, { maxLines: 5, maxChars: 100, head: 2, tail: 2, context: 1, maxBlocks: 3 })
    expect(r.text).toContain('red')
    expect(r.text).not.toContain('\x1b')
    expect(r.text).toContain('[repeated 100x]')
    expect(r.text).not.toContain('45%')
  })
  it('keeps only the first blocks of many errors and tells so', () => {
    const raw = long(600, (i) => (i % 20 === 0 ? `Error ${i}: failed` : `ok ${i}`))
    const r = condense(raw, { maxLines: 60, maxChars: 6000, head: 3, tail: 5, context: 0, maxBlocks: 4 })
    expect(r.text).toContain('error block(s) omitted')
    expect(r.text).toContain('ok 599')
  })
  it('cuts a very long line', () => {
    const r = condense(`${'x'.repeat(2000)}\n${long(100, (i) => `l${i}`)}`)
    expect(r.text).toContain('[+1600 chars]')
  })
})

describe('condensedResult', () => {
  it('adds the file to the footer, and returns null when nothing was shortened', () => {
    expect(condensedResult('short', '/tmp/x.txt')).toBeNull()
    const r = condensedResult(long(500, (i) => `row ${i}`), '/tmp/x.txt')
    expect(r!.text).toMatch(/\[condensed 500 -> \d+ lines\. Full output: \/tmp\/x\.txt\]$/)
  })
  it('has a threshold of 10k characters', () => expect(MIN_CHARS).toBe(10_000))
})

describe('skipCommand', () => {
  it('leaves diffs, file reads and commands marked raw alone', () => {
    expect(skipCommand('git diff HEAD~3')).toBe(true)
    expect(skipCommand('cd app && cat package.json')).toBe(true)
    expect(skipCommand('npm test # raw')).toBe(true)
    expect(skipCommand('npm test')).toBe(false)
  })
})
