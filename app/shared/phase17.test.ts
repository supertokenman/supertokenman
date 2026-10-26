import { describe, expect, it } from 'vitest'
import { deferReason } from './cascade'
import { shape } from './evals'
import { pct, rougeL, rougeN } from './rouge'

describe('rouge', () => {
  it('scores shared words, pairs and the longest common sequence', () => {
    expect(rougeN('the cat sat', 'the cat sat').f).toBe(1)
    expect(pct(rougeN('the cat', 'the cat sat on the mat').r)).toBe(33)
    expect(pct(rougeN('the cat sat', 'the cat ran', 2).f)).toBe(50)
    expect(pct(rougeL('a b c d', 'a x c d').f)).toBe(75)
    expect(rougeL('', 'x').f).toBe(0)
  })
})

describe('more shape checks', () => {
  it('reads bullets, commas, questions, case, JSON, code and titles', () => {
    expect(shape('- a\n- b\n- c', '@bullets:3')).toBe(true)
    expect(shape('one, two', '@no-commas')).toBe(false)
    expect(shape('Is it?', '@question')).toBe(true)
    expect(shape('all lower', '@lowercase')).toBe(true)
    expect(shape('```json\n{"a":1}\n```', '@json')).toBe(true)
    expect(shape('{a:1}', '@json')).toBe(false)
    expect(shape('x\n```js\n1\n```', '@code')).toBe(true)
    expect(shape('# Plan\ntext', '@title')).toBe(true)
    expect(shape('one two three', '@min-words:4')).toBe(false)
  })
})

describe('cascade', () => {
  it('lets a good draft stand and sends a doubtful one up', () => {
    expect(deferReason('commit', 'diff', 'Rename userId to accountId in billing')).toBeNull()
    expect(deferReason('commit', 'diff', 'x'.repeat(80))).toMatch(/72/)
    expect(deferReason('commit', 'diff', "Here's a commit message:\nfix")).toMatch(/chatter/)
    expect(deferReason('other', 'p', '')).toBe('empty draft')
    expect(deferReason('other', 'p', "I'm not sure what you mean")).toMatch(/unsure/)
    expect(deferReason('classify', 'pick one', 'frontend because the task is about css')).toMatch(/pick one/)
    expect(deferReason('classify', 'pick one', 'frontend')).toBeNull()
  })
})
