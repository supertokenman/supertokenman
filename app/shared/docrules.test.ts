import { describe, expect, it } from 'vitest'
import { checkRule, dateOf, fuse, matchRules, parseFacts, parseScores, parseTags, pathFrom, senderOf, type Rule } from './docrules'

describe('documents in', () => {
  const rules: Rule[] = [
    { id: '1', name: 'Energy bill', kind: 'words', value: 'enel fatura', tags: ['bills', 'energy'], template: '{sender}/{year}/{title}' },
    { id: '2', name: 'Invoice number', kind: 'regex', value: 'NF-?e\\s*\\d{4,}', tags: ['invoice'] },
    { id: '3', name: 'Broken', kind: 'regex', value: '([', tags: ['x'] },
  ]

  it('matches rules by every word or by regex, and ignores a broken one', () => {
    expect(matchRules('Sua FATURA de energia da Enel', 'conta.pdf', rules).map((r) => r.id)).toEqual(['1'])
    expect(matchRules('Nota NFe 123456 emitida', 'nf.pdf', rules).map((r) => r.id)).toEqual(['2'])
    expect(matchRules('fatura', 'x', rules)).toEqual([])
    expect(checkRule(rules[2]!)).toMatch(/does not compile/)
    expect(checkRule({ name: 'x', kind: 'words', value: 'a', template: '../etc' })).toMatch(/inside/)
    expect(checkRule(rules[0]!)).toBeNull()
  })

  it('builds the storage path from a template, never empty or escaping', () => {
    expect(pathFrom('{sender}/{year}/{title}', { title: 'Fatura outubro', sender: 'enel', date: '2026-10-05', tags: [], ext: '.pdf' })).toBe('enel/2026/Fatura outubro.pdf')
    expect(pathFrom('{tag}/{month}/{title}', { title: 'a/b:c', date: '2026-03-01', tags: [], ext: '.png' })).toBe('untagged/03/a-b-c.png')
    expect(pathFrom('{sender}/{title}', { title: '', tags: ['x'], ext: '.txt' })).toBe('unknown/untitled.txt')
  })

  it('reads a sender and a date from the text', () => {
    expect(senderOf('From: Enel Distribuição <conta@enel.com.br>\nFatura')).toBe('Enel Distribuição')
    expect(senderOf('Locador: Imobiliaria Casa Boa\nData: 01/02/2026')).toBe('Imobiliaria Casa Boa')
    expect(senderOf('pague em boleto@bancox.com.br')).toBe('bancox')
    expect(dateOf('Vencimento: 05/10/2026')).toBe('2026-10-05')
    expect(dateOf('issued 2026-09-30')).toBe('2026-09-30')
    expect(dateOf('nada')).toBeUndefined()
  })

  it('reads tags, facts and rerank scores from the local model', () => {
    expect(parseTags('Bills, #Energy, bills, a, this is a very long tag that goes on and on')).toEqual(['bills', 'energy'])
    expect(parseFacts('1. The Enel bill for October is R$ 231,40.\n- Due on 2026-10-05.\nok')).toEqual(['The Enel bill for October is R$ 231,40.', 'Due on 2026-10-05.'])
    expect(parseScores('1: 9\n2: 2\n3: 7', 3)).toEqual([9, 2, 7])
    expect(parseScores('I think the first', 3)).toBeNull()
  })

  it('fuses the keyword and meaning rankings', () => {
    const f = fuse([['a', 'b', 'c'], ['c', 'a', 'd']])
    expect(f.map((x) => x.id)).toEqual(['a', 'c', 'b', 'd'])
  })
})
