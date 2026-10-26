import { describe, expect, it } from 'vitest'
import { cleanPolicy, emptyPolicy, splitTool, verdict } from './mcppolicy'

describe('mcp approval by class', () => {
  it('splits MCP tool names', () => {
    expect(splitTool('mcp__github__create_issue')).toEqual({ server: 'github', tool: 'create_issue' })
    expect(splitTool('mcp__acme_db__list_tables')).toEqual({ server: 'acme_db', tool: 'list_tables' })
    expect(splitTool('Bash')).toBeNull()
  })

  it('lets reads run and asks for writes by default', () => {
    const p = emptyPolicy()
    expect(verdict(p, 'mcp__github__list_issues', undefined)).toMatchObject({ action: 'allow', cls: 'read' })
    expect(verdict(p, 'mcp__github__create_issue', undefined)).toMatchObject({ action: 'ask', cls: 'write' })
    expect(verdict(p, 'Read', undefined)).toBeNull()
  })

  it('uses what the inspector learned, then server, persona and tool rules', () => {
    const p = { ...emptyPolicy(), learned: { db: { run_report: 'read' as const } }, servers: { db: 'ask' as const, gh: 'all' as const }, personas: { reviewer: { gh: 'off' as const } }, tools: { 'gh/delete_repo': 'deny' as const } }
    expect(verdict({ ...p, servers: {} }, 'mcp__db__run_report', undefined)).toMatchObject({ action: 'allow', cls: 'read' })
    expect(verdict(p, 'mcp__db__run_report', undefined)).toMatchObject({ action: 'ask' })
    expect(verdict(p, 'mcp__gh__create_issue', undefined)).toMatchObject({ action: 'allow' })
    expect(verdict(p, 'mcp__gh__create_issue', 'reviewer')).toMatchObject({ action: 'deny', why: expect.stringMatching(/persona/) })
    expect(verdict(p, 'mcp__gh__delete_repo', undefined)).toMatchObject({ action: 'deny', why: expect.stringMatching(/your rule/) })
  })

  it('cleans what comes from the screen', () => {
    expect(cleanPolicy({ default: 'nope' as never, servers: { ok: 'ask', 'bad name!': 'all' } as never, tools: { 'a/b': 'allow', c: 'maybe' } as never })).toEqual({ default: 'reads', servers: { ok: 'ask' }, personas: {}, tools: { 'a/b': 'allow' }, learned: {} })
  })
})
