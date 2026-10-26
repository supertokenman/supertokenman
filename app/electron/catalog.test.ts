import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { github, mcpServers, plugins, rank, skills, type Item } from './catalog'

describe('catalog', () => {
  it('reads installed and available plugins from the CLI', async () => {
    const run = async () =>
      JSON.stringify({
        installed: [{ id: 'superpowers@official', enabled: true }, { id: 'mine@local' }],
        available: [
          { pluginId: 'superpowers@official', name: 'superpowers', description: 'TDD and debugging skills', marketplaceName: 'official', source: { url: 'https://github.com/obra/superpowers.git' } },
          { pluginId: 'frontend-design@official', name: 'frontend-design', description: 'UI work', marketplaceName: 'official' },
        ],
      })
    const items = await plugins(run)
    expect(items.map((i) => [i.id, i.installed])).toEqual([['superpowers@official', true], ['frontend-design@official', false], ['mine@local', true]])
    expect(items[0]!.url).toBe('https://github.com/obra/superpowers')
  })

  it('finds skills on disk with their front matter', () => {
    const home = mkdtempSync(join(tmpdir(), 'stm-home-'))
    mkdirSync(join(home, '.claude', 'skills', 'deploy'), { recursive: true })
    writeFileSync(join(home, '.claude', 'skills', 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: "Ship the Worker to Cloudflare"\n---\nSteps')
    expect(skills('/nowhere', home)).toEqual([{ source: 'skill', id: 'personal:deploy', name: 'deploy', description: 'Ship the Worker to Cloudflare', where: 'personal', installed: true }])
  })

  it('maps registry servers and GitHub repos', async () => {
    const fetchJson = async (url: string) =>
      url.includes('modelcontextprotocol')
        ? { servers: [{ server: { name: 'io.neon/neon', description: 'Neon Postgres', remotes: [{ type: 'streamable-http', url: 'https://mcp.neon.tech/mcp', headers: [{ isRequired: true }] }] } }, { server: { name: 'io.neon/neon' } }] }
        : { items: [{ full_name: 'obra/superpowers', description: 'skills', html_url: 'https://github.com/obra/superpowers', stargazers_count: 9000, topics: ['claude-code'] }] }
    expect(await mcpServers('neon', fetchJson)).toEqual([{ source: 'mcp', id: 'io.neon/neon', name: 'neon', description: 'Neon Postgres', where: 'io.neon', url: undefined, mcp: { remote: 'https://mcp.neon.tech/mcp', needsAuth: true, npm: undefined } }])
    expect(await github('skills', fetchJson)).toMatchObject([{ source: 'github', id: 'obra/superpowers', stars: 9000, where: 'claude-code' }])
  })

  it('ranks name hits over description hits, and needs every word', () => {
    const it = (name: string, description: string, installed = false): Item => ({ source: 'plugin', id: name, name, description, where: 'x', installed })
    const items = [it('docs-helper', 'writes supabase migrations'), it('supabase', 'database tools'), it('supabase-edge', 'functions', true), it('other', 'nothing')]
    expect(rank(items, 'supabase').map((i) => i.name)).toEqual(['supabase', 'supabase-edge', 'docs-helper'])
    expect(rank(items, 'supabase functions').map((i) => i.name)).toEqual(['supabase-edge'])
    expect(rank(items, '')).toBe(items)
  })
})
