import { describe, expect, it } from 'vitest'
import { insertDictation, spokenText, whisperLang } from './voicecmd'

describe('spokenText', () => {
  it('drops code, links and marks', () => {
    expect(spokenText('## Done\n\n**Renamed** `util.ts`, see [the PR](https://x.y/1).\n\n```ts\nconst a = 1\n```\n- ran tests')).toBe('Done\nRenamed util.ts, see the PR.\n(code block)\nran tests')
  })
  it('says a bare url is a link and cuts long replies at a word', () => {
    expect(spokenText('go to https://a.b/c now')).toBe('go to (link) now')
    const t = spokenText('word '.repeat(100), 30)
    expect(t.endsWith('The rest is on screen.')).toBe(true)
    expect(t.length).toBeLessThan(60)
  })
  it('handles an open code block at the end', () => {
    expect(spokenText('look\n```js\nx()')).toBe('look\n(code block)')
  })
})

describe('insertDictation', () => {
  it('adds spaces only where words touch', () => {
    expect(insertDictation('fix the', 7, 'login bug')).toEqual({ draft: 'fix the login bug', cursor: 17 })
    expect(insertDictation('fix  bug', 4, 'the')).toEqual({ draft: 'fix the bug', cursor: 7 })
    expect(insertDictation('', 0, '  hello ')).toEqual({ draft: 'hello', cursor: 5 })
    expect(insertDictation('abc', 3, '   ')).toEqual({ draft: 'abc', cursor: 3 })
  })
})

describe('whisperLang', () => {
  it('follows the voice id', () => {
    expect(whisperLang('pf_dora')).toBe('pt')
    expect(whisperLang('af_heart')).toBe('en')
    expect(whisperLang('')).toBe('')
  })
})
