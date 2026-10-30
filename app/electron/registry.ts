// One registry of what Claude Code can use here: the MCP servers installed for the person (in
// ~/.claude.json, for every project or for this one) and in the project's .mcp.json, and the skills on
// disk. Each one can be turned off per persona. Only names and where they come from are read: the
// servers' env and headers (which may hold keys) are never copied out.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Installed = { name: string; where: 'user' | 'this project (local)' | 'project .mcp.json' | `pack ${string}`; kind: 'stdio' | 'http' | 'sse'; target: string }

type Server = { type?: string; command?: string; args?: string[]; url?: string }
const readJson = (f: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}
const describe = (name: string, s: Server, where: Installed['where']): Installed => {
  const kind = s.type === 'http' || s.type === 'sse' ? s.type : s.url ? 'http' : 'stdio'
  // the command and its first real argument (the package) tell what it is; later ones may carry tokens
  const target = kind === 'stdio' ? [s.command ?? '', s.args?.find((a) => !a.startsWith('-')) ?? ''].join(' ').trim() : (s.url ?? '').replace(/[?#].*$/, '')
  return { name, where, kind, target }
}

/** `packs`: the servers of installed Packs that are switched on for this folder (origin "pack <id>"). */
export function installedMcp(cwd: string, home = homedir(), packs: Installed[] = []): Installed[] {
  const out: Installed[] = []
  const conf = readJson(join(process.env.CLAUDE_CONFIG_DIR ?? home, '.claude.json')) ?? readJson(join(home, '.claude.json'))
  for (const [n, s] of Object.entries((conf?.mcpServers ?? {}) as Record<string, Server>)) out.push(describe(n, s, 'user'))
  const proj = ((conf?.projects ?? {}) as Record<string, { mcpServers?: Record<string, Server> }>)[cwd]
  for (const [n, s] of Object.entries(proj?.mcpServers ?? {})) out.push(describe(n, s, 'this project (local)'))
  const mcp = cwd && existsSync(join(cwd, '.mcp.json')) ? readJson(join(cwd, '.mcp.json')) : null
  for (const [n, s] of Object.entries((mcp?.mcpServers ?? {}) as Record<string, Server>)) out.push(describe(n, s, 'project .mcp.json'))
  out.push(...packs)
  return out.filter((x, i) => out.findIndex((y) => y.name === x.name) === i)
}
