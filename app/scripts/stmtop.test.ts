import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module of the CLI, no types
import { currencyOf, moneyFn, render, toJson } from '../cli/top.mjs'

const snap = {
  at: Date.UTC(2026, 9, 27, 12, 0, 0),
  version: '1.1.0',
  todayUsd: 3.4567,
  limits: [{ kind: 'five_hour', percentUsed: 42.4, resetsAt: '2026-10-27T15:00:00.000Z' }],
  githubOn: true,
  panels: [
    { id: 'p1', project: 'supertokenman', cwd: '/home/me/supertokenman', model: 'claude-opus-4-1', modelLabel: 'Opus 4.1', state: 'running', goal: null, contextTokens: 50_000, contextWindow: 200_000, todayUsd: 2.5, approvals: [], ci: { repo: 'me/stm', branch: 'main', status: 'completed', conclusion: 'success', workflow: 'CI', at: 0 } },
    { id: 'p2', project: 'website', cwd: '/home/me/website', model: 'claude-sonnet-4-5', modelLabel: 'Sonnet 4.5', state: 'needs-you', goal: 'ship the blog', contextTokens: 120_000, contextWindow: 200_000, todayUsd: 0.9, approvals: [{ tool: 'Bash', summary: 'npm publish' }], ci: { repo: 'me/web', branch: 'blog', status: 'in_progress', conclusion: null, workflow: 'Deploy', at: 0 } },
    { id: 'p3', project: 'notes', cwd: '/home/me/notes', model: null, modelLabel: null, state: 'idle', goal: null, contextTokens: null, contextWindow: 200_000, todayUsd: 0, approvals: [], ci: null },
  ],
}
const usd = moneyFn('USD')

describe('stm top', () => {
  it('renders 80x24 with a selection', () => {
    const out = render(snap, { width: 80, height: 24, selected: 1, money: usd })
    expect(out.split('\n')).toHaveLength(24)
    for (const l of out.split('\n')) expect(l.length).toBeLessThanOrEqual(80)
    expect(out).toMatchSnapshot()
  })
  it('degrades in narrow terminals and without GitHub', () => {
    const narrow = render({ ...snap, githubOn: false }, { width: 36, height: 14, selected: 0, money: usd })
    for (const l of narrow.split('\n')) expect(l.length).toBeLessThanOrEqual(36)
    expect(narrow).toContain('CI: not connected')
    expect(narrow).toMatchSnapshot()
    expect(render(snap, { width: 50, height: 12, money: usd })).toMatchSnapshot()
  })
  it('colours only when asked', () => {
    expect(render(snap, { width: 80, height: 24, money: usd })).not.toContain('\x1b[')
    expect(render(snap, { width: 80, height: 24, money: usd, color: true })).toContain('\x1b[')
  })
  it('shows an empty state and help', () => {
    expect(render({ ...snap, panels: [] }, { width: 80, height: 10, money: usd })).toContain('No panels open')
    expect(render(snap, { width: 80, height: 24, money: usd, help: true })).toContain('q        quit')
  })
  it('picks the currency like the window', () => {
    expect(currencyOf({ LANG: 'pt_BR.UTF-8' })).toBe('BRL')
    expect(currencyOf({ LANG: 'en_US.UTF-8' })).toBe('USD')
    expect(currencyOf({ LANG: 'pt_BR.UTF-8' }, 'usd')).toBe('USD')
    expect(moneyFn('BRL', 5)(1)).toBe('R$ 5,00')
  })
  it('keeps the JSON shape', () => {
    const j = toJson(snap, 'BRL', 5)
    expect(Object.keys(j)).toEqual(['at', 'version', 'currency', 'today', 'fiveHour', 'approvalsWaiting', 'ciConnected', 'panels'])
    expect(j.today).toEqual({ usd: 3.4567, amount: 17.2835 })
    expect(j.fiveHour).toEqual({ percentUsed: 42, resetsAt: '2026-10-27T15:00:00.000Z' })
    expect(j.approvalsWaiting).toBe(1)
    expect(Object.keys(j.panels[0])).toEqual(['id', 'project', 'cwd', 'model', 'state', 'contextTokens', 'contextPercent', 'today', 'approvals', 'ci'])
    expect(j.panels[1].contextPercent).toBe(60)
    expect(j.panels[2].ci).toBeNull()
    expect(toJson({ ...snap, githubOn: false }, 'USD').panels[0].ci).toBeNull()
  })
  it('exits 2 when the app is not running', () => {
    const home = mkdtempSync(join(tmpdir(), 'stmtop-'))
    const r = spawnSync(process.execPath, [join(__dirname, '..', 'cli', 'stm.mjs'), 'top', '--once', '--json'], { env: { ...process.env, STM_HOME: home }, encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false })
  })
})
