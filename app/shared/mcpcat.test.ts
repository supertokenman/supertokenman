import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { configOf, filterList, parseList, review, serverName } from './mcpcat'

const MD = `## Legend
* 🎖️ – official implementation
## Server Implementations
### 🔗 <a name="aggregators"></a>Aggregators
- [inth3shadows/terse](https://github.com/inth3shadows/terse) [![x](https://glama.ai/a.svg)](https://glama.ai/b) 🐍 🏠 🍎 🪟 🐧 - Transparent proxy that shrinks tool output.
### 🗄️ <a name="databases"></a>Databases
- [supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp) 🎖️ 📇 ☁️ - Official Supabase server.
- [someone/shell-mcp](https://github.com/someone/shell-mcp) 📇 🏠 - Execute any shell command on your machine.
## Clients
- [not/a-server](https://github.com/not/a-server) - a client
`

describe('mcp catalog', () => {
  it('reads the list with its markers', () => {
    const l = parseList(MD)
    expect(l.map((e) => [e.repo, e.category, e.official, e.langs, e.scope])).toEqual([
      ['inth3shadows/terse', 'Aggregators', false, ['Python'], ['local']],
      ['supabase-community/supabase-mcp', 'Databases', true, ['TypeScript'], ['cloud']],
      ['someone/shell-mcp', 'Databases', false, ['TypeScript'], ['local']],
    ])
    expect(l[0]!.os).toEqual(['macOS', 'Windows', 'Linux'])
    expect(l[0]!.description).toBe('Transparent proxy that shrinks tool output.')
    expect(filterList(l, { q: 'supabase' }).map((e) => e.repo)).toEqual(['supabase-community/supabase-mcp'])
    expect(filterList(l, { official: true })).toHaveLength(1)
  })

  it('finds the install config in a README', () => {
    const readme = 'Install:\n```json\n{\n  // Claude Desktop\n  "mcpServers": {\n    "supabase": { "command": "npx", "args": ["-y", "@supabase/mcp-server-supabase@0.4.1"], "env": { "SUPABASE_ACCESS_TOKEN": "<token>" } },\n  }\n}\n```'
    expect(configOf(readme)).toEqual({ name: 'supabase', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@0.4.1'], type: 'stdio', env: ['SUPABASE_ACCESS_TOKEN'] })
    expect(configOf('```json\n{"mcpServers":{"x":{"url":"https://mcp.example.com/sse","type":"sse"}}}\n```')).toMatchObject({ url: 'https://mcp.example.com/sse', type: 'sse' })
    expect(configOf('no config')).toBeNull()
    expect(serverName('@supabase/MCP Server')).toBe('supabase-mcp-server')
  })

  it('reviews before install', () => {
    const l = parseList(MD)
    const ok = review(l[1]!, 'Apache-2.0', { name: 's', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@0.4.1'], type: 'stdio', env: ['SUPABASE_ACCESS_TOKEN'] }, 10)
    expect(ok.level).toBe('ok')
    const shell = review(l[2]!, null, { name: 'sh', command: 'npx', args: ['shell-mcp'], type: 'stdio', env: [] }, 500)
    expect(shell.level).toBe('stop')
    expect(shell.notes.map((n) => n.text).join(' ')).toMatch(/No LICENSE file.*without a fixed version.*shell, files/s)
  })

  it('reads the real list when it is here', () => {
    if (!existsSync('/tmp/stmt/awesome-mcp.md')) return
    const l = parseList(readFileSync('/tmp/stmt/awesome-mcp.md', 'utf8'))
    expect(l.length).toBeGreaterThan(1000)
    expect(new Set(l.map((e) => e.category)).size).toBeGreaterThan(20)
  })
})
