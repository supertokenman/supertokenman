// A free API becomes an MCP server, the parts with no network: the public-apis list (MIT) read into rows,
// an OpenAPI document read into operations, and a small MCP server written as plain files you review
// before anything runs: one tool per operation, the key read from the environment, a pause between
// calls so the API's rate limit is respected. Reads are marked read-only for the approvals.

export type ApiRow = { name: string; url: string; description: string; auth: 'none' | 'apiKey' | 'OAuth' | 'other'; https: boolean; cors: string; category: string }

/** The README's category tables; the sponsored block at the top is skipped. */
export function parsePublicApis(md: string): ApiRow[] {
  const out: ApiRow[] = []
  let category = ''
  for (const line of md.split('\n')) {
    const h = /^### (.+)$/.exec(line)
    if (h) {
      category = /APILayer/i.test(h[1]!) ? '' : h[1]!.trim()
      continue
    }
    if (!category) continue
    const m = /^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/.exec(line)
    if (!m) continue
    const auth = m[4]!.replace(/`/g, '').trim()
    out.push({ name: m[1]!.trim(), url: m[2]!.trim(), description: m[3]!.trim(), auth: auth === 'No' || !auth ? 'none' : auth === 'apiKey' ? 'apiKey' : auth === 'OAuth' ? 'OAuth' : 'other', https: /yes/i.test(m[5]!), cors: m[6]!.trim(), category })
  }
  return out
}

export type Param = { name: string; in: 'path' | 'query' | 'body'; required: boolean; type: 'string' | 'number' | 'integer' | 'boolean'; description?: string }
export type Op = { tool: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; summary: string; params: Param[] }

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 60)
const typeOf = (s: { type?: unknown } | undefined): Param['type'] => (s?.type === 'number' || s?.type === 'integer' || s?.type === 'boolean' ? s.type : 'string')

/** OpenAPI 3 (or Swagger 2) operations, at most `max`, GETs first; JSON bodies become their top-level fields. */
export function opsOf(spec: unknown, max = 30): { base: string; ops: Op[] } {
  const s = spec as { servers?: { url: string }[]; host?: string; basePath?: string; schemes?: string[]; paths?: Record<string, Record<string, unknown>> }
  const base = s.servers?.[0]?.url ?? (s.host ? `${s.schemes?.[0] ?? 'https'}://${s.host}${s.basePath ?? ''}` : '')
  const ops: Op[] = []
  const seen = new Set<string>()
  for (const [path, item] of Object.entries(s.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const o = item[method] as { operationId?: string; summary?: string; description?: string; parameters?: { name: string; in: string; required?: boolean; schema?: { type?: string }; type?: string; description?: string }[]; requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] } }> } } | undefined
      if (!o) continue
      let tool = snake(o.operationId ?? `${method}_${path.replace(/\{([^}]+)\}/g, 'by_$1')}`) || `${method}_op`
      for (let i = 2; seen.has(tool); i++) tool = `${tool}_${i}`
      seen.add(tool)
      const params: Param[] = [...((item.parameters as typeof o.parameters) ?? []), ...(o.parameters ?? [])]
        .filter((p) => p.in === 'path' || p.in === 'query')
        .map((p) => ({ name: p.name, in: p.in as 'path' | 'query', required: p.in === 'path' || Boolean(p.required), type: typeOf(p.schema ?? p), ...(p.description ? { description: p.description.slice(0, 200) } : {}) }))
      const body = o.requestBody?.content?.['application/json']?.schema
      for (const [name, b] of Object.entries(body?.properties ?? {})) params.push({ name, in: 'body', required: (body?.required ?? []).includes(name), type: typeOf(b), ...(b.description ? { description: b.description.slice(0, 200) } : {}) })
      ops.push({ tool, method: method.toUpperCase() as Op['method'], path, summary: (o.summary ?? o.description ?? `${method.toUpperCase()} ${path}`).split('\n')[0]!.slice(0, 200), params })
    }
  }
  return { base, ops: ops.sort((a, b) => Number(b.method === 'GET') - Number(a.method === 'GET')).slice(0, max) }
}

export type Auth = { type: 'none' | 'header' | 'query' | 'bearer'; name?: string; env?: string }
export type Gen = { name: string; base: string; auth: Auth; ops: Op[]; minIntervalMs: number; source: string }

export function checkGen(g: Gen): string | null {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(g.name)) return 'The name is lowercase letters, digits and dashes.'
  if (!/^https:\/\/[^\s'"`]+$/.test(g.base)) return 'The base URL must be https.'
  if (!g.ops.length) return 'Add at least one endpoint.'
  if (g.auth.type !== 'none' && !/^[A-Z][A-Z0-9_]{1,63}$/.test(g.auth.env ?? '')) return 'Name the vault key, such as CATS_API_KEY.'
  if ((g.auth.type === 'header' || g.auth.type === 'query') && !/^[\w-]{1,60}$/.test(g.auth.name ?? '')) return 'Name the header or query parameter the key goes in.'
  for (const o of g.ops) {
    if (!/^[a-z][a-z0-9_]{0,60}$/.test(o.tool)) return `${o.tool}: a tool name is lowercase with underscores.`
    if (!/^\/[\w\-./{}~%]*$/.test(o.path)) return `${o.tool}: the path must start with / and have no spaces or quotes.`
    for (const p of o.params) if (!/^[A-Za-z_][\w.-]{0,60}$/.test(p.name)) return `${o.tool}: ${p.name} is not a usable parameter name.`
  }
  return null
}

const zodOf = (p: Param) => `z.${p.type === 'integer' ? 'number().int()' : `${p.type}()`}${p.required ? '' : '.optional()'}${p.description ? `.describe(${JSON.stringify(p.description)})` : ''}`

/** The server's files: server.mjs, package.json and a README; plain JavaScript so it runs with node. */
export function generate(g: Gen): { path: string; content: string }[] {
  const tools = g.ops
    .map((o) => {
      const shape = `{ ${o.params.map((p) => `${JSON.stringify(p.name)}: ${zodOf(p)}`).join(', ')} }`
      const where = JSON.stringify(Object.fromEntries(o.params.map((p) => [p.name, p.in])))
      return `server.registerTool(${JSON.stringify(o.tool)}, { description: ${JSON.stringify(`${o.summary} (${o.method} ${o.path})`)}, inputSchema: ${shape}, annotations: { readOnlyHint: ${o.method === 'GET'}, openWorldHint: true } }, (args) => call(${JSON.stringify(o.method)}, ${JSON.stringify(o.path)}, ${where}, args))`
    })
    .join('\n')
  const authLine =
    g.auth.type === 'none' ? '' : g.auth.type === 'bearer' ? `  headers.authorization = \`Bearer \${key()}\`` : g.auth.type === 'header' ? `  headers[${JSON.stringify(g.auth.name)}] = key()` : `  url.searchParams.set(${JSON.stringify(g.auth.name)}, key())`
  const server = `// ${g.name}: an MCP server for ${g.base}, written by SuperTokenMan from ${g.source}.
// One tool per endpoint. ${g.auth.type === 'none' ? 'No key.' : `The key comes from the environment as ${g.auth.env}, never from this file.`}
// Calls wait ${g.minIntervalMs} ms between them to keep under the API's rate limit.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE = ${JSON.stringify(g.base.replace(/\/+$/, ''))}
const GAP = ${Math.max(0, Math.round(g.minIntervalMs))}
let last = 0
${g.auth.type === 'none' ? '' : `const key = () => {\n  const k = process.env[${JSON.stringify(g.auth.env)}]\n  if (!k) throw new Error(${JSON.stringify(`${g.auth.env} is not set.`)})\n  return k\n}\n`}
async function call(method, path, where, args) {
  const wait = last + GAP - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  last = Date.now()
  let p = path
  const body = {}
  const url = new URL(BASE + '/')
  for (const [k, v] of Object.entries(args ?? {})) {
    if (v === undefined) continue
    if (where[k] === 'path') p = p.replace('{' + k + '}', encodeURIComponent(String(v)))
    else if (where[k] === 'body') body[k] = v
    else url.searchParams.set(k, String(v))
  }
  const full = new URL(BASE + p)
  url.searchParams.forEach((v, k) => full.searchParams.set(k, v))
  const headers = { accept: 'application/json' }
${authLine.replace('url.', 'full.')}
  const hasBody = Object.keys(body).length > 0
  const r = await fetch(full, { method, headers: hasBody ? { ...headers, 'content-type': 'application/json' } : headers, body: hasBody ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) })
  const text = (await r.text()).slice(0, 100000)
  return { content: [{ type: 'text', text: r.ok ? text : \`HTTP \${r.status}: \${text.slice(0, 2000)}\` }], isError: !r.ok }
}

const server = new McpServer({ name: ${JSON.stringify(g.name)}, version: '0.1.0' })
${tools}
await server.connect(new StdioServerTransport())
`
  const pkg = JSON.stringify({ name: `mcp-${g.name}`, version: '0.1.0', private: true, type: 'module', main: 'server.mjs', dependencies: { '@modelcontextprotocol/sdk': '1.32.1', zod: '3.25.76' } }, null, 2) + '\n'
  const readme = `# ${g.name}\n\nAn MCP server for ${g.base}, written by SuperTokenMan from ${g.source}.\n\n${g.ops.map((o) => `- \`${o.tool}\`: ${o.method} ${o.path}, ${o.summary}`).join('\n')}\n\nRun \`npm install\` here once. ${g.auth.type === 'none' ? 'It needs no key.' : `It reads ${g.auth.env} from the environment.`} Check the API's terms and rate limits before relying on it.\n`
  return [
    { path: 'server.mjs', content: server },
    { path: 'package.json', content: pkg },
    { path: 'README.md', content: readme },
  ]
}
