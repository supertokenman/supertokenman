import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blockedFor, cleanPersona } from '../shared/personas'
import { installedMcp } from './registry'

describe('registry', () => {
  it('lists installed MCP servers by name and place, never their secrets', () => {
    const home = mkdtempSync(join(tmpdir(), 'rg-'))
    const cwd = join(home, 'proj')
    mkdirSync(cwd)
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/?token=SECRET', headers: { Authorization: 'Bearer SECRET' } } }, projects: { [cwd]: { mcpServers: { pg: { command: 'npx', args: ['-y', '@x/pg', 'postgres://u:SECRET@h/db'], env: { PGPASSWORD: 'SECRET' } } } } } }))
    writeFileSync(join(cwd, '.mcp.json'), JSON.stringify({ mcpServers: { figma: { type: 'sse', url: 'http://127.0.0.1:3845/sse' }, github: { command: 'dup' } } }))
    const list = installedMcp(cwd, home)
    expect(list).toEqual([
      { name: 'github', where: 'user', kind: 'http', target: 'https://api.githubcopilot.com/mcp/' },
      { name: 'pg', where: 'this project (local)', kind: 'stdio', target: 'npx @x/pg' },
      { name: 'figma', where: 'project .mcp.json', kind: 'sse', target: 'http://127.0.0.1:3845/sse' },
    ])
    expect(JSON.stringify(list)).not.toContain('SECRET')
  })

  it('adds the servers of installed packs with their origin, after the others', () => {
    const home = mkdtempSync(join(tmpdir(), 'rg-'))
    const cwd = join(home, 'proj')
    mkdirSync(cwd)
    const list = installedMcp(cwd, home, [{ name: 'pack-pg-helper-pg', where: 'pack pg-helper', kind: 'stdio', target: 'npx @x/pg' }])
    expect(list).toEqual([{ name: 'pack-pg-helper-pg', where: 'pack pg-helper', kind: 'stdio', target: 'npx @x/pg' }])
  })

  it('turns a persona off-lists into permission rules', () => {
    const p = cleanPersona({ name: 'Writer', mcpOff: ['github', 'bad name!'], skillsOff: ['pdf'] })
    expect(p.mcpOff).toEqual(['github'])
    expect(blockedFor(p)).toEqual(['mcp__github', 'Skill(pdf)'])
    expect(blockedFor(cleanPersona({ name: 'x' }))).toEqual([])
  })
})
