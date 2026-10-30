import { describe, expect, it } from 'vitest'
import { formatRule, parseRule, parseRules } from './policyrules'

const EXAMPLES = [
  'deny Bash when cmd matches "rm -rf *" and path outside $project -- recursive delete outside project',
  'deny Bash when cmd matches "git push*" unless branch matches "claude/*"',
  'ask network',
  'allow read when path inside $project',
]

describe('policy rule parser', () => {
  it('parses the grammar: effect, tool, when, unless, note', () => {
    const r = parseRules(EXAMPLES[0]!)
    expect(r.errors).toEqual([])
    expect(r.rules[0]).toEqual({
      line: 1,
      effect: 'deny',
      tool: 'Bash',
      when: [
        { field: 'cmd', op: 'matches', value: { text: 'rm -rf *', quoted: true } },
        { field: 'path', op: 'outside', value: { text: '$project', quoted: false } },
      ],
      unless: [],
      note: 'recursive delete outside project',
    })
  })

  it('parses unless clauses and a tool without conditions', () => {
    const r = parseRule(EXAMPLES[1]!)
    expect(r).toMatchObject({ effect: 'deny', tool: 'Bash', when: [{ field: 'cmd' }], unless: [{ field: 'branch', op: 'matches', value: { text: 'claude/*', quoted: true } }], note: '' })
    expect(parseRule('ask network')).toMatchObject({ effect: 'ask', tool: 'network', when: [], unless: [] })
  })

  it('accepts arg.<key> fields and escaped quotes', () => {
    const r = parseRule('allow mcp__stm__* when arg.label has "say \\"hi\\""')
    expect(r).toMatchObject({ when: [{ field: 'arg.label', op: 'has', value: { text: 'say "hi"', quoted: true } }] })
  })

  it('skips blank lines and # comments, numbering lines from 1', () => {
    const r = parseRules(['# header', '', 'ask network', '   # indented comment', 'allow read when path inside $project'].join('\n'))
    expect(r.errors).toEqual([])
    expect(r.rules.map((x) => x.line)).toEqual([3, 5])
  })

  it('reports line-numbered errors and drops only the bad lines', () => {
    const text = ['deny Bash when cmd is "x"', 'permit Bash', 'allow Bash when color is red', 'ask Bash when cmd matches "open" and', 'allow Bash when cmd is "unclosed', 'ask network']
      .join('\n')
    const r = parseRules(text)
    expect(r.rules.map((x) => x.line)).toEqual([1, 6])
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5])
    expect(r.errors[0]!.message).toContain('permit')
    expect(r.errors[1]!.message).toContain('color')
    expect(r.errors[2]!.message).toContain('a field')
    expect(r.errors[3]!.message).toContain('unclosed quote')
  })

  it('accepts a bare glob value and rejects a bare "--" used as a value', () => {
    expect(parseRule('allow write when path matches src/*')).toMatchObject({ when: [{ value: { text: 'src/*', quoted: false } }] })
    expect(parseRule('allow write when path is --')).toHaveProperty('message')
  })

  it('rejects a when or unless with no condition, and a dangling and', () => {
    expect(parseRule('deny Bash when')).toHaveProperty('message')
    expect(parseRule('deny Bash unless')).toHaveProperty('message')
    expect(parseRule('deny Bash when cmd is "x" and')).toHaveProperty('message')
    expect(parseRule('deny Bash when cmd is "x" extra')).toHaveProperty('message')
  })

  it('round-trips the examples in the spec exactly', () => {
    for (const line of EXAMPLES) {
      const r = parseRule(line)
      expect('message' in r).toBe(false)
      expect(formatRule(r as Parameters<typeof formatRule>[0])).toBe(line)
    }
  })

  it('formats a parsed rule back to a rule that parses to the same thing', () => {
    const odd = 'deny Bash when cmd has "a\\\\b" and arg.x is plain unless host matches "*.example.com" -- note with -- dashes'
    const first = parseRule(odd)
    if ('message' in first) throw new Error(first.message)
    const again = parseRule(formatRule(first))
    expect(again).toEqual(first)
  })
})
