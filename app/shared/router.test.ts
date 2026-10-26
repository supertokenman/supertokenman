import { describe, expect, it } from 'vitest'
import { STARTERS } from './personas'
import { choosePrompt, learn, route, stripMention, type Learned } from './router'

const pick = (t: string) => route(t, STARTERS).persona?.id ?? null

describe('route', () => {
  it('follows an @mention first', () => {
    const r = route('@writer revisa esse PR', STARTERS)
    expect(r).toMatchObject({ persona: { id: 'writer' }, sure: true, mention: true })
    expect(stripMention('@writer revisa esse PR', r)).toBe('revisa esse PR')
  })
  it('picks by the words, in Portuguese or English', () => {
    expect(pick('revisa o PR 42 e procura bugs de segurança')).toBe('reviewer')
    expect(pick('o deploy no Cloudflare quebrou no CI')).toBe('devops')
    expect(pick('ajusta o layout da tela de login no tema escuro')).toBe('frontend')
    expect(pick('escreve o changelog e atualiza o README')).toBe('writer')
  })
  it('says when nothing decides', () => {
    expect(route('oi, tudo bem?', STARTERS)).toMatchObject({ persona: null, sure: false })
  })
  it('is not sure on a tie', () => {
    const r = route('review the deploy', STARTERS)
    expect(r.sure).toBe(false)
  })
  it('asks Claude for one id', () => {
    expect(choosePrompt('x', STARTERS)).toMatch(/- reviewer: Reviewer\./)
  })

  it('learns from the persona the person picks, and gets sure after a few', () => {
    const msg = 'ajusta o onboarding do checkout'
    expect(route(msg, STARTERS).persona).toBeNull()
    let l: Learned = {}
    l = learn(l, msg, 'frontend')
    // once is not a habit
    expect(route(msg, STARTERS, l).persona).toBeNull()
    l = learn(learn(l, 'onboarding novo', 'frontend'), 'checkout quebrado no onboarding', 'frontend')
    const r = route('melhora o onboarding', STARTERS, l)
    expect(r.persona?.id).toBe('frontend')
    // the person's own habit is enough to be sure: it wins over a model's guess
    expect(r.sure).toBe(true)
    expect(r.why).toContain('onboarding')
  })
  it('weighs a word by where it usually goes', () => {
    let l: Learned = {}
    for (let i = 0; i < 3; i++) l = learn(l, 'onboarding', 'frontend')
    for (let i = 0; i < 3; i++) l = learn(l, 'onboarding', 'writer')
    // split evenly: it decides nothing
    expect(route('onboarding', STARTERS, l).persona).toBeNull()
  })
  it('keeps only the most recent words', () => {
    let l: Learned = {}
    for (let i = 0; i < 10; i++) l = learn(l, `palavra${i}x`, 'writer', 5)
    expect(Object.keys(l)).toEqual(['palavra5x', 'palavra6x', 'palavra7x', 'palavra8x', 'palavra9x'])
    expect(learn(l, 'palavra5x', 'writer', 5)['palavra5x']).toEqual({ writer: 2 })
    expect(Object.keys(learn(l, 'palavra5x', 'writer', 5)).at(-1)).toBe('palavra5x')
  })
})
