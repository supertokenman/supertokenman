// The MCP inspector in the main process: a connection to one server at a time (an installed one by name,
// or a command or URL you type), its tools, resources and prompts listed, and a tool called by hand with
// the time and size of the answer. Uses the MCP TypeScript SDK (MIT). Write tools need the screen's
// confirm; the server is closed when the sheet closes or after ten idle minutes.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
// the MCP client loads on the first check or inspection, not at start-up
const sdk = async () => {
  const [{ Client }, { StdioClientTransport }, { StreamableHTTPClientTransport }, { SSEClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
    import('@modelcontextprotocol/sdk/client/sse.js'),
  ])
  return { Client, StdioClientTransport, StreamableHTTPClientTransport, SSEClientTransport }
}
import { classOf, listTokens, suspicious, type Tool } from '../shared/mcpinspect.js'

export type Target = { name?: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; type?: 'stdio' | 'http' | 'sse' }
type Server = { type?: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }

/** The installed servers' full configs, read only in the main process (they may carry env values). */
function installed(claudeDir: string, cwd: string): Record<string, Server> {
  const read = (f: string) => {
    try {
      return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  const user = read(join(claudeDir, '.claude.json'))
  const local = ((user.projects ?? {}) as Record<string, { mcpServers?: Record<string, Server> }>)[cwd]?.mcpServers ?? {}
  const proj = cwd ? ((read(join(cwd, '.mcp.json')).mcpServers ?? {}) as Record<string, Server>) : {}
  return { ...((user.mcpServers ?? {}) as Record<string, Server>), ...local, ...proj }
}

/** One installed server started, its tools read, and closed: for the health check. Never calls a tool. */
export async function probe(claudeDir: string, cwd: string, name: string, timeoutMs = 20_000): Promise<{ ok: boolean; ms: number; error?: string; tools: Tool[]; version?: string }> {
  const cfg = installed(claudeDir, cwd)[name]
  if (!cfg) return { ok: false, ms: 0, error: 'Not installed here.', tools: [] }
  const { Client, StdioClientTransport, StreamableHTTPClientTransport, SSEClientTransport } = await sdk()
  const client = new Client({ name: 'supertokenman-health', version: '1.0.0' })
  const t0 = performance.now()
  const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`No answer in ${timeoutMs / 1000} s.`)), timeoutMs))
  try {
    const work = (async () => {
      if (cfg.url) {
        const url = new URL(cfg.url)
        const opts = cfg.headers ? { requestInit: { headers: cfg.headers } } : undefined
        await client.connect(cfg.type === 'sse' ? new SSEClientTransport(url, opts) : new StreamableHTTPClientTransport(url, opts))
      } else await client.connect(new StdioClientTransport({ command: cfg.command!, args: cfg.args ?? [], env: { ...(process.env as Record<string, string>), ...(cfg.env ?? {}) }, cwd: cwd || undefined, stderr: 'pipe' }))
      const tools = client.getServerCapabilities()?.tools ? ((await client.listTools()).tools as Tool[]) : []
      return { ok: true, ms: Math.round(performance.now() - t0), tools, version: client.getServerVersion()?.version }
    })()
    return await Promise.race([work, timer])
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: (e as Error).message.slice(0, 300), tools: [] }
  } finally {
    await client.close().catch(() => undefined)
  }
}

export function mcpInspector(claudeDir: () => string) {
  let cur: { client: Client; label: string; at: number; tools: Tool[] } | null = null
  let idle: NodeJS.Timeout | null = null
  const touch = () => {
    if (idle) clearTimeout(idle)
    idle = setTimeout(() => void close(), 10 * 60_000)
    if (cur) cur.at = Date.now()
  }
  async function close() {
    if (idle) clearTimeout(idle)
    const c = cur
    cur = null
    await c?.client.close().catch(() => undefined)
  }
  const need = () => {
    if (!cur) throw new Error('Not connected.')
    touch()
    return cur.client
  }
  return {
    servers: (cwd: string) => Object.entries(installed(claudeDir(), cwd)).map(([name, s]) => ({ name, kind: s.url ? (s.type === 'sse' ? 'sse' : 'http') : 'stdio', target: s.url ? s.url.replace(/[?#].*$/, '') : [s.command, ...(s.args ?? []).filter((a) => !a.startsWith('-')).slice(0, 2)].join(' ') })),
    async connect(t: Target, cwd: string) {
      await close()
      let cfg: Server = t
      if (t.name) {
        const s = installed(claudeDir(), cwd)[t.name]
        if (!s) throw new Error(`No server named ${t.name}.`)
        cfg = s
      }
      const label = t.name ?? cfg.url ?? [cfg.command, ...(cfg.args ?? [])].join(' ')
      const { Client, StdioClientTransport, StreamableHTTPClientTransport, SSEClientTransport } = await sdk()
      const client = new Client({ name: 'supertokenman-inspector', version: '1.0.0' })
      const t0 = performance.now()
      if (cfg.url) {
        const url = new URL(cfg.url)
        const opts = cfg.headers ? { requestInit: { headers: cfg.headers } } : undefined
        await client.connect(cfg.type === 'sse' ? new SSEClientTransport(url, opts) : new StreamableHTTPClientTransport(url, opts))
      } else {
        if (!cfg.command) throw new Error('Give a command or a URL.')
        await client.connect(new StdioClientTransport({ command: cfg.command, args: cfg.args ?? [], env: { ...(process.env as Record<string, string>), ...(cfg.env ?? {}) }, cwd: cwd || undefined, stderr: 'pipe' }))
      }
      const ms = Math.round(performance.now() - t0)
      const caps = client.getServerCapabilities() ?? {}
      const tools = caps.tools ? ((await client.listTools()).tools as Tool[]) : []
      cur = { client, label, at: Date.now(), tools }
      touch()
      return {
        label,
        ms,
        server: client.getServerVersion() ?? null,
        instructions: client.getInstructions() ?? null,
        tools: tools.map((x) => ({ ...x, cls: classOf(x), flags: suspicious(x) })),
        tokens: listTokens(tools),
        resources: caps.resources ? (await client.listResources().catch(() => ({ resources: [] }))).resources : [],
        prompts: caps.prompts ? (await client.listPrompts().catch(() => ({ prompts: [] }))).prompts : [],
      }
    },
    /** A write tool runs only when the screen says the person confirmed it. */
    async call(name: string, args: Record<string, unknown>, confirmed: boolean) {
      const c = need()
      const tool = cur!.tools.find((x) => x.name === name)
      if (!tool) throw new Error('No such tool.')
      if (classOf(tool) === 'write' && !confirmed) throw new Error('This tool can change things; confirm first.')
      const t0 = performance.now()
      const r = await c.callTool({ name, arguments: args }, undefined, { timeout: 120_000 })
      const text = JSON.stringify(r)
      return { result: r, ms: Math.round(performance.now() - t0), bytes: text.length, isError: Boolean((r as { isError?: boolean }).isError) }
    },
    readResource: async (uri: string) => need().readResource({ uri }),
    getPrompt: async (name: string, args: Record<string, string>) => need().getPrompt({ name, arguments: args }),
    close,
    status: () => (cur ? { label: cur.label, since: cur.at } : null),
  }
}
