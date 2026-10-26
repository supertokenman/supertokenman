import { describe, expect, it } from 'vitest'
import { applyView, checkHours, expand, matchShortcut, nextOpen, parsePick, setStatus, snoozeChoices, triage, variables, within, type Incoming, type Kept } from './inbox'

const msg = (thread: string, at: string, over: Partial<Incoming> = {}): Incoming => ({ source: 'outlook', id: `${thread}-${at}`, thread, from: { name: 'Ana Souza', handle: 'ana@acme.dev' }, subject: 'PR review', text: 'Can you look at the PR?', at, ...over })

describe('one inbox', () => {
  it('opens new conversations and keeps one per thread, the latest message', () => {
    const { list, kept } = triage([msg('t1', '2026-10-24T10:00:00Z'), msg('t1', '2026-10-24T11:00:00Z'), msg('t2', '2026-10-24T09:00:00Z', { source: 'bluesky' })], {}, 1000)
    expect(list.map((c) => [c.key, c.status, c.at])).toEqual([['outlook:t1', 'open', '2026-10-24T11:00:00Z'], ['bluesky:t2', 'open', '2026-10-24T09:00:00Z']])
    expect(kept['outlook:t1']!.lastAt).toBe('2026-10-24T11:00:00Z')
  })

  it('wakes a snooze at its time or when they reply, and reopens done on a new message', () => {
    const base: Kept = { status: 'open', since: 0, labels: [], notes: [], lastAt: '2026-10-24T10:00:00Z' }
    const timed = setStatus(base, 'snoozed', 0, { until: 5000 })
    const reply = setStatus(base, 'snoozed', 0, { untilReply: true })
    const done = setStatus(base, 'done', 0)
    const same = [msg('a', '2026-10-24T10:00:00Z'), msg('b', '2026-10-24T10:00:00Z'), msg('c', '2026-10-24T10:00:00Z')]
    const k = { 'outlook:a': timed, 'outlook:b': reply, 'outlook:c': done }
    expect(triage(same, k, 4000).list.map((c) => c.status)).toEqual(['snoozed', 'snoozed', 'done'])
    expect(triage(same, k, 6000).list.find((c) => c.thread === 'a')!.status).toBe('open')
    const newer = [msg('a', '2026-10-24T10:00:00Z'), msg('b', '2026-10-24T12:00:00Z'), msg('c', '2026-10-24T12:00:00Z')]
    const after = triage(newer, k, 4000).list
    expect(after.find((c) => c.thread === 'b')!.status).toBe('open')
    expect(after.find((c) => c.thread === 'c')!.status).toBe('open')
    expect(() => setStatus(base, 'snoozed', 0, {})).toThrow(/until/)
  })

  it('expands saved replies and finds them by shortcut', () => {
    const v = variables({ from: { name: 'Ana Souza', handle: 'ana@acme.dev' }, subject: 'PR review' }, 'Yuji')
    expect(expand('Oi {{first_name}}, sobre "{{subject}}": vejo hoje. {{my_name}} {{nope}}', v)).toBe('Oi Ana, sobre "PR review": vejo hoje. Yuji {{nope}}')
    const replies = [{ shortcut: 'thanks', text: 'Obrigado!' }, { shortcut: 'later', text: 'Vejo depois.' }, { shortcut: 'thx_en', text: 'Thanks!' }]
    expect(matchShortcut('/th', replies).map((r) => r.shortcut)).toEqual(['thanks', 'thx_en'])
    expect(matchShortcut('hello', replies)).toEqual([])
    expect(parsePick('/later', replies)?.shortcut).toBe('later')
    expect(parsePick('none', replies)).toBeNull()
  })

  it('filters with a saved view: sources, statuses, labels and words, notes included', () => {
    const { list } = triage([msg('a', '2026-10-24T10:00:00Z'), msg('b', '2026-10-24T09:00:00Z', { source: 'mastodon', text: 'meetup on saturday' })], { 'outlook:a': { status: 'open', since: 0, labels: ['client'], notes: [{ at: 0, text: 'invoice pending' }] } })
    expect(applyView(list, { name: 'x', sources: ['outlook'], statuses: ['open'], labels: ['client'], text: 'invoice' }).map((c) => c.thread)).toEqual(['a'])
    expect(applyView(list, { name: 'x', sources: [], statuses: [], labels: [], text: 'meetup' }).map((c) => c.thread)).toEqual(['b'])
  })

  it('knows business hours and lands snoozes inside them', () => {
    const h = { on: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
    const fri19 = new Date(2026, 9, 23, 19, 0)
    expect(within(h, new Date(2026, 9, 23, 10, 0))).toBe(true)
    expect(within(h, fri19)).toBe(false)
    expect(within({ ...h, on: false }, fri19)).toBe(true)
    expect(nextOpen(h, fri19)).toEqual(new Date(2026, 9, 26, 9, 0))
    const choices = snoozeChoices(h, fri19)
    expect(new Date(choices[1]!.until)).toEqual(new Date(2026, 9, 26, 9, 0))
    expect(checkHours({ ...h, end: '08:00' })).toMatch(/after/)
  })
})
