import { describe, expect, it } from 'vitest'
import { duration, sayArgs, since, speech, summary, type Event } from './overnight'

const T0 = Date.UTC(2026, 9, 28, 12, 0)
const MIN = 60_000
const at = (m: number, e: Omit<Event, 'at'>): Event => ({ at: T0 + m * MIN, ...e })

describe('overnight', () => {
  it('filters to events at or after the mark and sorts them by time', () => {
    const evs = [at(30, { panel: 'b', kind: 'turn' }), at(-5, { panel: 'a', kind: 'turn' }), at(10, { panel: 'c', kind: 'turn' })]
    expect(since(evs, T0).map((e) => e.panel)).toEqual(['c', 'b'])
    expect(evs[0]!.panel).toBe('b')
  })

  it('orders the summary lines and counts them', () => {
    const evs = [
      at(1, { panel: 'p1', kind: 'approval-waiting' }),
      at(2, { panel: 'p1', kind: 'approval-waiting' }),
      at(3, { panel: 't1', kind: 'trigger-run' }),
      at(4, { panel: 'p1', kind: 'turn', costUsd: 0.5 }),
      at(5, { panel: 'p2', kind: 'turn', costUsd: 0.75 }),
      at(6, { panel: 'p2', kind: 'loop-ended' }),
    ]
    const s = summary(evs, T0, T0 + 7 * MIN)
    expect(s.title).toBe('While you were away (7 min)')
    expect(s.lines).toEqual([
      '2 approvals wait for you: p1',
      '1 trigger runs: t1',
      '2 turns in 2 panels',
      'Spent $1.25',
    ])
  })

  it('caps errors at three and says how many more there are', () => {
    const evs = [1, 2, 3, 4, 5].map((m) => at(m, { panel: `p${m}`, kind: 'error', text: 'boom' }))
    const lines = summary(evs, T0, T0 + 10 * MIN).lines
    expect(lines).toEqual(['Errors: p1: boom', 'Errors: p2: boom', 'Errors: p3: boom', 'and 2 more'])
  })

  it('cuts error text to 120 characters', () => {
    const line = summary([at(1, { panel: 'p', kind: 'error', text: 'x'.repeat(300) })], T0, T0 + MIN).lines[0]!
    expect(line).toBe(`Errors: p: ${'x'.repeat(120)}`)
  })

  it('says so when nothing ran', () => {
    expect(summary([at(-60, { panel: 'p', kind: 'turn' })], T0, T0 + 60 * MIN).lines).toEqual(['Nothing ran while you were away.'])
  })

  it('formats durations in minutes, hours and days', () => {
    expect(duration(45 * MIN)).toBe('45 min')
    expect(duration(120 * MIN)).toBe('2 h')
    expect(duration((7 * 60 + 20) * MIN)).toBe('7 h 20 min')
    expect(duration(3 * 24 * 60 * MIN)).toBe('3 days')
  })

  it('turns dollars into words for speech and drops markup', () => {
    const out = speech({ title: 'While you were away (2 h)', lines: ['Spent $1.25', '**Errors**: `p`'] })
    expect(out).toBe('While you were away (2 h)\nSpent 1.25 dollars\nErrors: p')
  })

  it('builds say arguments with and without a voice', () => {
    expect(sayArgs('hello')).toEqual(['--', 'hello'])
    expect(sayArgs('hello', 'Samantha')).toEqual(['-v', 'Samantha', '--', 'hello'])
    expect(sayArgs('hello', 'Bad Voice (Enhanced)')).toEqual(['-v', 'Bad Voice (Enhanced)', '--', 'hello'])
  })

  it('rejects a bad voice name and keeps a leading dash after --', () => {
    expect(() => sayArgs('hi', 'Samantha; rm -rf /')).toThrow('Unknown voice name.')
    expect(() => sayArgs('hi', '')).toThrow('Unknown voice name.')
    expect(sayArgs('-n evil')).toEqual(['--', '-n evil'])
    expect(sayArgs('x'.repeat(3000))[1]).toHaveLength(2000)
  })
})
