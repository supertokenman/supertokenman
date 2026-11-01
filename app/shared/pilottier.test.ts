import { describe, expect, it } from 'vitest'
import { findCommand, type CommandSpec } from './pilotcatalog'
import { resolveTier, taintedAfter, toDecision, WIDENING_KEYS } from './pilottier'

const cmd = (id: string): CommandSpec => findCommand(id)!.spec
const clean = { tainted: false, ruleAllows: false }

describe('toDecision', () => {
  it('allows free tier', () => {
    expect(toDecision('free', clean)).toBe('allow')
    expect(toDecision('free', { tainted: true, ruleAllows: false })).toBe('allow')
  })
  it('asks ask tier without a rule', () => {
    expect(toDecision('ask', clean)).toBe('ask')
  })
  it('allows ask tier only with a matching rule in a clean session', () => {
    expect(toDecision('ask', { tainted: false, ruleAllows: true })).toBe('allow')
  })
  it('never allows ask tier in a tainted session, even with a rule', () => {
    expect(toDecision('ask', { tainted: true, ruleAllows: true })).toBe('ask')
  })
  it('never allows confirm, with or without a rule or a clean session', () => {
    expect(toDecision('confirm', clean)).toBe('ask')
    expect(toDecision('confirm', { tainted: false, ruleAllows: true })).toBe('ask')
    expect(toDecision('confirm', { tainted: true, ruleAllows: true })).toBe('ask')
  })
})

describe('resolveTier', () => {
  it('uses the spec tier for ordinary args', () => {
    expect(resolveTier(cmd('go-today'), { args: {} })).toBe('free')
    expect(resolveTier(cmd('go-stm'), { args: {} })).toBe('ask')
  })
  it('raises an irreversible command to confirm', () => {
    const spec: CommandSpec = { ...cmd('go-today'), effect: 'irreversible' }
    expect(resolveTier(spec, { args: {} })).toBe('confirm')
  })
  it('raises a change to a widening setting key to confirm', () => {
    const setting = { ...cmd('go-private'), undo: 'setting' as const }
    expect(resolveTier(setting, { args: { key: 'mcpSend' } })).toBe('confirm')
    expect(resolveTier(setting, { args: { key: 'hotkey' } })).toBe('free')
  })
  it('never lowers the spec tier', () => {
    const ask = cmd('go-stm')
    expect(resolveTier(ask, { args: {} })).toBe('ask')
  })
  it('lists the widening keys, as checked against main.ts', () => {
    expect([...WIDENING_KEYS].sort()).toEqual([
      'agentCap', 'budget', 'control', 'coolifyUrl', 'customEndpoint', 'dbConns', 'dockerWrite', 'dokployUrl', 'fanoutCap',
      'fullTools', 'immichUrl', 'integrations', 'keepRunning', 'mcpSend', 'netSlots', 'panelLinks', 'personas', 'phone', 'pilotEverywhere',
      'providers', 'rocketchat', 'socialAccounts', 'spawnPerHour', 'spotify', 'stirlingUrl', 'stmLimits', 'triggers', 'updateCheck',
    ].sort())
  })
  it('raises a change to each widening key to confirm', () => {
    const setting = { ...cmd('go-private'), undo: 'setting' as const }
    for (const key of WIDENING_KEYS) expect(resolveTier(setting, { args: { key } })).toBe('confirm')
  })
})

describe('taintedAfter', () => {
  it('taints after reads of files, the web and channel messages', () => {
    for (const t of ['Read', 'Grep', 'WebFetch', 'WebSearch', 'mcp__stm__channel_read', 'mcp__stm__channel_mentions']) {
      expect(taintedAfter(t)).toBe(true)
    }
  })
  it('taints after a shell command, which can fetch or print untrusted content', () => {
    expect(taintedAfter('Bash')).toBe(true)
  })
  it('taints after a non-stm MCP server result', () => {
    expect(taintedAfter('mcp__github__get_file_contents')).toBe(true)
    expect(taintedAfter('mcp__panels__panel_state')).toBe(true)
    expect(taintedAfter('mcp__claude_docs__read')).toBe(true)
  })
  it('does not taint after the app tools or a plain write', () => {
    expect(taintedAfter('mcp__stm__app_run')).toBe(false)
    expect(taintedAfter('mcp__stm__app_commands')).toBe(false)
    expect(taintedAfter('mcp__stm__ui_set_layout')).toBe(false)
    expect(taintedAfter('Edit')).toBe(false)
  })
})
