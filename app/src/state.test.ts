import { describe, expect, it } from 'vitest'
import { hudView, initial, reduce, savedUsd } from './state'

describe('state', () => {
  it('builds the transcript and the HUD from events', () => {
    let s = reduce(initial, { kind: 'ready', sessionId: 's', model: 'm', cwd: '/p' })
    s = reduce(s, { kind: 'sent', text: 'hi', at: 0 })
    s = reduce(s, { kind: 'delta', text: 'Hel' })
    expect(s.streaming).toBe('Hel')
    s = reduce(s, { kind: 'assistant', text: 'Hello', tools: [{ id: 't', name: 'Bash', summary: 'ls' }] })
    s = reduce(s, { kind: 'turn', costUsd: 0.5, inputTokens: 1, outputTokens: 1, cacheRead: 0, cacheWrite: 0, isError: false, text: 'ok' }, 1000)
    s = reduce(s, { kind: 'context', tokens: 68000, window: 200000, percent: 34 })
    s = reduce(s, { kind: 'limits', windows: [{ kind: 'five_hour', percentUsed: 23 }] })
    expect(s.lines).toEqual([
      { kind: 'user', text: 'hi' },
      { kind: 'assistant', text: 'Hello' },
      { kind: 'tool', name: 'Bash', summary: 'ls' },
    ])
    expect(s.busy).toBe(false)
    const v = hudView(s, (usd) => `R$${(usd * 5).toFixed(2)}`, 1000 + 10 * 60000)
    expect(v).toMatchObject({ ctxUsed: 34, ctxTokens: '68k', ctxWindow: '200k', five: { used: 23 }, seven: null, cacheLeft: 50, round: 1, score: 'R$2.50' })
  })

  it('drops an answered permission', () => {
    let s = reduce(initial, { kind: 'permission', id: 'p1', tool: 'Bash', summary: 'ls' })
    expect(s.asks).toHaveLength(1)
    s = reduce(s, { kind: 'answered', id: 'p1' })
    expect(s.asks).toHaveLength(0)
  })

  it('collects a shell run from its streamed events', () => {
    let s = reduce(initial, { kind: 'shell-start', id: 'sh1', command: 'npm test', cwd: '/p' })
    s = reduce(s, { kind: 'shell-out', id: 'sh1', text: 'ok 1\n', stream: 'out' })
    s = reduce(s, { kind: 'shell-out', id: 'sh1', text: 'ok 2\n', stream: 'out' })
    s = reduce(s, { kind: 'shell-end', id: 'sh1', code: 0, ms: 840 })
    expect(s.lines).toEqual([{ kind: 'shell', id: 'sh1', command: 'npm test', out: 'ok 1\nok 2\n', code: 0, ms: 840, running: false }])
  })

  it('keeps only the tail of finished command output when a new one starts', () => {
    let s = reduce(initial, { kind: 'shell-start', id: 'a', command: 'npm test', cwd: '/' })
    s = reduce(s, { kind: 'shell-out', id: 'a', text: 'x'.repeat(20000) + 'END', stream: 'out' })
    s = reduce(s, { kind: 'shell-end', id: 'a', code: 0, ms: 1 })
    s = reduce(s, { kind: 'shell-start', id: 'b', command: 'ls', cwd: '/' })
    const a = s.lines[0] as { out: string }
    expect(a.out.length).toBeLessThan(8100)
    expect(a.out.startsWith('... 12003 characters dropped')).toBe(true)
    expect(a.out.endsWith('END')).toBe(true)
  })

  it("counts token-kit's cuts as savings and plays a K.O. right after one", () => {
    let s = reduce(initial, { kind: 'ready', sessionId: 's', model: 'claude-opus-5-5', cwd: '/p' })
    s = reduce(s, { kind: 'cut', tokens: 10000, at: 1000, cmd: 'npm test' })
    const turn = { kind: 'turn' as const, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, isError: false, text: '' }
    for (const t of [2000, 3000, 4000]) s = reduce(s, turn, t)
    // 10k tokens: written once at $8/MTok, re-read 3 times at $0.20/MTok
    expect(savedUsd(s)).toBeCloseTo(0.086, 6)
    const money = (usd: number) => `R$${(usd * 5).toFixed(2)}`
    expect(hudView(s, money, 3000)).toMatchObject({ saved: 'R$0.43', kos: 1, ko: { tokens: '10k', usd: 'R$0.40' } })
    expect(hudView(s, money, 10000).ko).toBeNull()
  })
})

describe('evidence after a turn', () => {
  it('adds a mark when the last reply claims a fix', async () => {
    const { withEvidence } = await import('./state')
    const lines = withEvidence([
      { kind: 'user', text: 'fix it' },
      { kind: 'tool', name: 'Edit', summary: 'a.ts' },
      { kind: 'assistant', text: 'The bug is fixed.' },
    ])
    expect(lines.at(-1)).toMatchObject({ kind: 'evidence', level: 'inferred', claim: 'The bug is fixed' })
    expect(withEvidence([{ kind: 'user', text: 'hi' }, { kind: 'assistant', text: 'Hello.' }])).toHaveLength(2)
  })
})
