import { describe, expect, it } from 'vitest'
import { byStyles, versusNone, type Band } from './bands'
import { grade, shape } from './evals'
import { cleanPersona, fromMarkdown, personaPrompt, toMarkdown } from './personas'
import { cleanStyles, splitReport, styleRule } from './styles'

describe('answer styles', () => {
  it('adds the rules of the styles on, in a fixed order', () => {
    expect(styleRule([])).toBe('')
    const r = styleRule(['report', 'lean'])
    expect(r.indexOf('ladder')).toBeLessThan(r.indexOf('Not verified'))
    expect(styleRule(['lean', 'report'])).toBe(r)
    expect(cleanStyles(['lean', 'nope', 'lean', 3])).toEqual(['lean'])
  })
  it('travels with the persona and reaches its prompt', () => {
    const p = cleanPersona({ name: 'Dev', instructions: 'Build things.', styles: ['action'] })
    expect(fromMarkdown(toMarkdown(p)).styles).toEqual(['action'])
    expect(personaPrompt(p)).toContain('Next:')
    expect(personaPrompt(cleanPersona({ name: 'X', instructions: 'Y' }))).not.toContain('How to answer')
  })
  it('splits the closing Not verified section from the answer', () => {
    const t = 'Changed the parser.\n\n**Not verified**\n- the Windows build\n- 2. load under 1k users'
    expect(splitReport(t)).toEqual({ body: 'Changed the parser.', report: ['the Windows build', 'load under 1k users'] })
    expect(splitReport('### Não verificado\n- nada').report).toEqual(['nada'])
    expect(splitReport('Just text').report).toBeNull()
  })
})

describe('shape checks', () => {
  const good = 'Run `npm test`.\n\n1. Open the file\n2. Fix line 4\n\nNext: send the first failing line.'
  it('reads numbered steps, the next line, filler and length', () => {
    expect(shape(good, '@numbered')).toBe(true)
    expect(shape(good, '@next')).toBe(true)
    expect(shape(good, '@no-filler')).toBe(true)
    expect(shape('Great question! Here it is. Hope this helps', '@no-filler')).toBe(false)
    expect(shape(good, '@max-words:12')).toBe(false)
    expect(shape(good, '@max-lines:4')).toBe(true)
    expect(shape('Done.\n\nNot verified\n- nothing', '@report')).toBe(true)
    expect(shape(good, '@unknown')).toBeNull()
  })
  it('grade uses them like any check', () => {
    expect(grade({ id: 'E1', prompt: 'p', must: ['@numbered', '@next'], mustNot: [] }, good, 'local').pass).toBe(true)
    expect(grade({ id: 'E1', prompt: 'p', must: ['@next'], mustNot: [] }, 'Sure.', 'local').missing).toEqual(['@next'])
  })
})

describe('cost bands', () => {
  const b = (styles: string[], costUsd: number, tokens: number): Band => ({ at: 1, project: 'p', styles, prompt: 'x', costUsd, tokens, ms: 1000, tools: 1, edits: 1, isError: false })
  it('averages per style set and compares with none once both have enough tasks', () => {
    const list = [...Array(5)].flatMap(() => [b([], 0.1, 1000), b(['lean', 'action'], 0.06, 700)])
    const s = byStyles(list)
    expect(s.map((x) => x.key)).toEqual(['none', 'action+lean'])
    expect(s[1]).toMatchObject({ n: 5, tokens: 700 })
    expect(versusNone(s, 'action+lean')).toEqual({ cost: -40, tokens: -30 })
    expect(versusNone(byStyles(list.slice(0, 4)), 'action+lean')).toBeNull()
  })
})
