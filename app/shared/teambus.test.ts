import { describe, expect, it } from 'vitest'
import { MAX_OPEN_PER_PANEL, MAX_QUESTION, newAsk, canOpen, wouldLoop, askText, replyText, type Ask } from './teambus'

const ask = (from: string, to: string): Ask => ({ id: `${from}${to}`, from, to, question: 'q', depth: 0, at: 0 })

describe('team bus', () => {
  it('refuses a panel asking itself, an empty question, and too deep a chain', () => {
    expect(() => newAsk('A', 'A', 'hi')).toThrow('A panel cannot ask itself.')
    expect(() => newAsk('A', 'B', '   ')).toThrow('Write the question.')
    expect(() => newAsk('A', 'B', 'hi', 3)).toThrow(/more than 2 deep/)
    expect(newAsk('A', 'B', 'hi', 2).depth).toBe(2)
  })
  it('trims the question and cuts it to MAX_QUESTION characters', () => {
    const a = newAsk('A', 'B', `  ${'x'.repeat(MAX_QUESTION + 50)}  `, 0, 1000, 'id1')
    expect(a.question.length).toBe(MAX_QUESTION)
    expect(a.id).toBe('id1')
    expect(newAsk('A', 'B', 'ok', 0, 255).id).toBe('a73')
  })
  it('stops a panel at the open-ask limit', () => {
    const open = Array.from({ length: MAX_OPEN_PER_PANEL }, () => ask('A', 'B'))
    expect(canOpen(open, 'A')).toMatch(/open questions/)
    expect(canOpen(open.slice(1), 'A')).toBeNull()
    expect(canOpen(open, 'B')).toBeNull()
  })
  it('detects a loop across three panels', () => {
    const open = [ask('A', 'B'), ask('B', 'C')]
    expect(wouldLoop(open, 'C', 'A')).toBe(true)
    expect(wouldLoop(open, 'C', 'D')).toBe(false)
    expect(wouldLoop(open, 'B', 'C')).toBe(false)
    expect(wouldLoop([], 'A', 'B')).toBe(false)
  })
  it('detects a direct reverse ask', () => {
    expect(wouldLoop([ask('A', 'B')], 'B', 'A')).toBe(true)
  })
  it('writes the ask for the target and the reply for the asker', () => {
    const a = newAsk('A', 'B', 'Which port?\nThe second line.')
    const t = askText('api', a)
    expect(t.startsWith('Panel api asks for help:\n\nWhich port?')).toBe(true)
    expect(t).toContain('it goes back to api.')
    expect(replyText('ui', a, '  8080  \n')).toBe('Panel ui answered your question:\n\n> Which port?\n\n8080')
    expect(replyText('ui', a, '  ')).toBe('Panel ui gave no answer.')
  })
})
