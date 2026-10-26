import { describe, expect, it } from 'vitest'
import { cleanPersona, fromMarkdown, personaPrompt, STARTERS, toMarkdown } from './personas'

describe('personas', () => {
  it('travel as Markdown and come back the same', () => {
    for (const p of STARTERS) expect(fromMarkdown(toMarkdown(p))).toEqual(cleanPersona(p))
  })
  it('clean what comes in', () => {
    const p = cleanPersona({ name: '  Revisão Sênior  ', color: 'red', integrations: ['github', 'github', 'bad id!'], model: 'claude-opus-5-5' })
    expect(p).toMatchObject({ id: 'revisao-senior', name: 'Revisão Sênior', color: '#d97757', integrations: ['github'] })
  })
  it('refuse a file without the header', () => {
    expect(() => fromMarkdown('just text')).toThrow(/persona file/)
  })
  it('say the role first', () => {
    expect(personaPrompt(STARTERS[0]!)).toMatch(/^# Your role in this panel: Reviewer/)
  })
})
