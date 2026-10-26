import { describe, expect, it } from 'vitest'
import { addChoice, kindOf, presetOf, vote, type Tally } from './arena'
import { correctionOf, withRule } from './corrections'
import { casesText, grade, parseCases, rewritePrompt } from './evals'
import { addTurn, contextParts, whyCost } from './trace'
import { pushVersion } from './versions'

describe('trace', () => {
  it('sizes the context parts and drops empty ones', () => {
    const p = contextParts([{ name: 'Persona', text: 'a'.repeat(36) }, { name: 'Memory', text: 'b'.repeat(360) }, { name: 'Empty', text: '  ' }])
    expect(p.map((x) => [x.name, x.tokens])).toEqual([['Memory', 100], ['Persona', 10]])
  })
  it('keeps the newest turns and says why a turn cost what it did', () => {
    const t = { at: 1, prompt: 'x', tools: ['Read', 'Edit'], costUsd: 0.01, inputTokens: 1200, outputTokens: 80, cacheRead: 30000, isError: false }
    expect(addTurn(Array(60).fill(t), { ...t, at: 2 })[0]!.at).toBe(2)
    expect(addTurn(Array(60).fill(t), t)).toHaveLength(60)
    expect(whyCost(t)).toBe('1,200 new input · 30,000 from cache · 80 written · 2 tool calls')
  })
})

describe('persona versions', () => {
  it('keeps what a save replaced, once, newest first', () => {
    const h1 = pushVersion([], { instructions: 'a', model: '' }, { instructions: 'b', model: '' }, undefined, 15, 1)
    expect(h1).toEqual([{ at: 1, instructions: 'a', model: '' }])
    expect(pushVersion(h1, { instructions: 'b', model: '' }, { instructions: 'b', model: '' })).toBe(h1)
    expect(pushVersion(h1, { instructions: 'b', model: '' }, { instructions: 'c', model: '' }, 'rule', 15, 2)[0]).toEqual({ at: 2, instructions: 'b', model: '', note: 'rule' })
    expect(pushVersion(Array(15).fill(h1[0]), { instructions: 'z', model: '' }, { instructions: 'y', model: '' })).toHaveLength(15)
  })
})

describe('corrections', () => {
  it('reads standing rules and corrections, in English and Portuguese', () => {
    expect(correctionOf('no, use pnpm')).toEqual({ rule: 'Use pnpm.' })
    expect(correctionOf('Nunca rode migrations sem perguntar')).toEqual({ rule: 'Nunca rode migrations sem perguntar.' })
    expect(correctionOf('from now on write commits in English')?.rule).toBe('From now on write commits in English.')
    expect(correctionOf('não, prefira fetch em vez de axios')?.rule).toBe('Prefira fetch em vez de axios.')
  })
  it('leaves ordinary messages alone', () => {
    expect(correctionOf('add a login page')).toBeNull()
    expect(correctionOf('should we always use pnpm?')).toBeNull()
    expect(correctionOf('no')).toBeNull()
    expect(correctionOf('não sei')).toBeNull()
  })
  it('adds a rule once under its heading', () => {
    const a = withRule('Be brief.', 'Use pnpm.')
    expect(a).toBe('Be brief.\n\nRules the person set:\n- Use pnpm.')
    expect(withRule(a, 'Use pnpm.')).toBe(a)
    expect(withRule(a, 'No emoji.')).toBe(`${a}\n- No emoji.`)
  })
})

describe('arena', () => {
  it('names the kind of a small task', () => {
    expect(kindOf('Write a git commit message for this staged diff')).toBe('commit')
    expect(kindOf('Resuma este texto')).toBe('summarize')
    expect(kindOf('Write one short, warm reply to this comment')).toBe('reply')
    expect(kindOf('hello')).toBe('other')
  })
  it('turns a clear winner into a preset after three picks', () => {
    let t: Tally = {}
    t = vote(vote(t, 'commit', 'local'), 'commit', 'tie')
    expect(presetOf(t, 'commit')).toBeNull()
    t = vote(t, 'commit', 'local')
    expect(presetOf(t, 'commit')).toBe('local')
    let c: Tally = {}
    for (const w of ['claude', 'claude', 'local'] as const) c = vote(c, 'code', w)
    expect(presetOf(c, 'code')).toBe('claude')
    expect(presetOf(vote(c, 'code', 'local'), 'code')).toBeNull()
  })
  it('keeps the last choices', () => {
    const c = { at: 1, kind: 'other' as const, where: 'local' as const, why: 'model' as const, ms: 5 }
    expect(addChoice(Array(100).fill(c), { ...c, at: 2 })).toHaveLength(100)
  })
})

describe('evals', () => {
  it('reads cases from lines and writes them back', () => {
    const text = '# comment\nReview this: eval(x) | must: security, /eval\\(/ | not: looks fine\nSay hi'
    const cases = parseCases(text)
    expect(cases).toEqual([
      { id: 'E1', prompt: 'Review this: eval(x)', must: ['security', '/eval\\(/'], mustNot: ['looks fine'] },
      { id: 'E2', prompt: 'Say hi', must: [], mustNot: [] },
    ])
    expect(parseCases(casesText(cases))).toEqual(cases)
  })
  it('grades with plain text, accents and regex', () => {
    const c = { id: 'E1', prompt: 'p', must: ['seguranca', '/eval\\(/'], mustNot: ['looks fine'] }
    expect(grade(c, 'Problema de segurança: eval( com entrada', 'local').pass).toBe(true)
    const bad = grade(c, 'Looks fine to me', 'claude')
    expect(bad).toMatchObject({ pass: false, missing: ['seguranca', '/eval\\(/'], forbidden: ['looks fine'] })
  })
  it('asks for a rewrite that fixes the failures', () => {
    expect(rewritePrompt('Be brief.', ['E1 missed "security"'])).toContain('- E1 missed "security"')
  })
})
