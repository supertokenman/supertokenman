import { describe, expect, it } from 'vitest'
import { addTurn, addWindows, capVerdict, chip, cleanCap, empty, rows } from './panelusage'

describe('panel usage', () => {
  it('says not reported when the CLI reports nothing', () => {
    const r = rows(empty('Claude Code'))
    expect(r.find((x) => x.label === 'Cost this session')?.value).toBe('not reported')
    expect(r.find((x) => x.label === 'Tokens this session')?.value).toBe('not reported')
    expect(r.find((x) => x.label === 'Rate limits')?.value).toBe('not reported')
    expect(capVerdict(empty('x'), { usd: 1, tokens: 1 }).ok).toBe(true)
  })
  it('sums tokens per turn and keeps the running cost', () => {
    let u = addTurn(empty('Claude Code'), { costUsd: 0.1, inputTokens: 100, outputTokens: 50, cacheRead: 1000, cacheWrite: 0 })
    u = addTurn(u, { costUsd: 0.25, inputTokens: 10, outputTokens: 5 })
    u = addTurn(u, { costUsd: Number.NaN })
    expect(u).toMatchObject({ turns: 3, usd: 0.25, tokens: 1165 })
  })
  it('keeps the newest reading per window', () => {
    let u = addWindows(empty('c'), [{ kind: 'five_hour', percentUsed: 20, resetsAt: '2026-10-28T15:00:00.000Z' }])
    u = addWindows(u, [{ kind: 'five_hour', percentUsed: 41 }, { kind: 'bad', percentUsed: Number.NaN }])
    expect(u.windows).toEqual({ five_hour: { percentUsed: 41, resetsAt: undefined } })
    expect(rows(u).find((x) => x.label === '5-hour window')?.value).toBe('41% used')
  })
  it('holds at the cap, by cost or tokens', () => {
    const u = addTurn(empty('Claude Code'), { costUsd: 2, inputTokens: 50_000 })
    expect(capVerdict(u, { usd: 3 }).ok).toBe(true)
    expect(capVerdict(u, { usd: 2 })).toMatchObject({ ok: false, reason: expect.stringContaining('US$ 2.00') })
    expect(capVerdict(u, { tokens: 40_000 }).ok).toBe(false)
    expect(chip(u, { usd: 4 })).toBe('50k tok · 50% of cap')
    expect(cleanCap({ usd: -1, tokens: 12.6 })).toEqual({ tokens: 13 })
  })
})
