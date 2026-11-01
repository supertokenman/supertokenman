import { describe, expect, it } from 'vitest'
import { parseRules } from '../../shared/policyrules'
import { taint } from '../../shared/browsersession'
import { Guard, type Card } from './guard'

function make(rulesText = '', answer: 'once' | 'always' | 'deny' = 'once') {
  const rows: { tool: string; args: string; decision: string; by: string }[] = []
  const written: string[] = []
  const cards: Card[] = []
  const rules = parseRules(rulesText).rules.map((rule) => ({ scope: 'project' as const, rule }))
  const g: Guard = new Guard({
    now: () => 1000,
    rules: () => rules,
    ctx: () => ({ project: '/p', home: '/h', cwd: '/p' }),
    previewPanel: () => false,
    limits: () => ({}),
    ask: async (c) => (cards.push(c), queueMicrotask(() => g.answer(c.id, answer)), new Promise<'once'>(() => undefined)),
    writeRule: (_p, t) => written.push(t),
    audit: (_p, r) => rows.push(r),
  })
  return { g, rows, written, cards }
}

describe('guard', () => {
  it('asks for a new host once and remembers a "once" answer for the session', async () => {
    const { g, cards, rows } = make()
    expect(await g.navigate('s1', 'https://example.com/a')).toBe(true)
    expect(await g.navigate('s1', 'https://example.com/b')).toBe(true)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.detail).toMatchObject({ host: 'example.com', always: true })
    expect(rows.map((r) => r.decision)).toEqual(['ask', 'approved', 'allow'])
  })
  it('two requests for the same host at once share one card', async () => {
    const { g, cards } = make()
    const both = await Promise.all([g.navigate('s1', 'https://a.com/1'), g.navigate('s1', 'https://a.com/2')])
    expect(both).toEqual([true, true])
    expect(cards).toHaveLength(1)
  })
  it('always writes the host rule, but not from a tainted session', async () => {
    const a = make('', 'always')
    await a.g.navigate('s1', 'https://example.com/')
    expect(a.written).toEqual(['allow mcp__stm__browser_* when host is "example.com" -- agent browser: always for this host'])
    const b = make('', 'always')
    b.g.update('s1', taint)
    await b.g.navigate('s1', 'https://example.com/')
    expect(b.written).toEqual([])
    expect(b.cards[0]!.detail.always).toBe(false)
  })
  it('deny refuses and says so; an allow rule goes through with no card; a deny rule refuses', async () => {
    const d = make('', 'deny')
    expect(await d.g.navigate('s1', 'https://x.com/')).toBe(false)
    expect(d.g.lastRefusal('s1')).toMatch(/did not allow/)
    expect(d.rows.at(-1)).toMatchObject({ decision: 'refused', by: 'person' })
    const r = make('allow mcp__stm__browser_* when host is "ok.com"\ndeny mcp__stm__browser_* when host is "bad.com"')
    expect(await r.g.navigate('s1', 'https://ok.com/')).toBe(true)
    expect(await r.g.navigate('s1', 'https://bad.com/')).toBe(false)
    expect(r.cards).toHaveLength(0)
    expect(r.rows.map((x) => x.decision)).toEqual(['allow', 'deny'])
  })
  it('private addresses are refused with no card', async () => {
    const { g, cards } = make()
    expect(await g.navigate('s1', 'http://192.168.1.5/')).toBe(false)
    expect(await g.navigate('s1', 'file:///etc/passwd')).toBe(false)
    expect(cards).toHaveLength(0)
  })
  it('the new-host budget ends further hosts', async () => {
    const { g } = make('allow mcp__stm__browser_* when host is "*.test"')
    g.update('s1', (s) => ({ ...s, budget: { ...s.budget, limits: { ...s.budget.limits, newHosts: 1 } } }))
    expect(await g.navigate('s1', 'https://a.test/')).toBe(true)
    expect(await g.navigate('s1', 'https://b.test/')).toBe(false)
    expect(g.lastRefusal('s1')).toMatch(/new-host limit/)
  })
  it('a download is kept only when the person says so, and is audited', async () => {
    const yes = make('', 'once')
    expect(await yes.g.download('s1', { name: 'a.pdf', size: 10, host: 'x.com' })).toBe(true)
    const no = make('', 'deny')
    expect(await no.g.download('s1', { name: 'a.pdf', size: 10, host: 'x.com' })).toBe(false)
    expect(no.rows.map((r) => r.decision)).toEqual(['ask', 'refused'])
    expect(no.cards[0]!.kind).toBe('download')
  })
})
