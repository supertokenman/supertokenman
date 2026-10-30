// pack.json: strict validation of a Pack manifest (spec section 4). Pure: takes the file's text and
// returns the manifest or the list of what is wrong. Path rules for `files` are in packpath.ts.
import { z } from 'zod'

export const MANIFEST_MAX_BYTES = 64 * 1024
export const RULES_MAX_BYTES = 8 * 1024

const CONTROL = /[\u0000-\u001f\u007f]/
const BARE_COMMANDS = ['npx', 'uvx', 'node', 'python3', 'docker'] as const
// A stdio command that fetches a package needs its registry in `hosts` (spec section 4).
const REGISTRY_HOSTS: Record<string, string[]> = {
  npx: ['registry.npmjs.org'],
  uvx: ['pypi.org', 'files.pythonhosted.org'],
  docker: ['registry-1.docker.io', 'docker.io'],
}

const text = (max: number) => z.string().max(max).refine(s => !CONTROL.test(s), 'no control characters')
const packId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/, 'lowercase letters, digits and hyphens (2 to 48)')
const serverName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/, 'lowercase letters, digits and hyphens (1 to 32)')
const envName = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'an environment variable name')
const hostname = z.string().max(253).regex(
  /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
  'a hostname only (no scheme, port or path; "*.example.com" allowed)',
)
const semver = z.string().regex(
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
  'semver MAJOR.MINOR.PATCH',
)

// A stdio command: a bare allowlisted program, or a relative path inside the installed pack.
function commandError(cmd: string): string | null {
  if ((BARE_COMMANDS as readonly string[]).includes(cmd)) return null
  if (!cmd.includes('/')) return `command must be one of ${BARE_COMMANDS.join(', ')} or a relative path inside the pack`
  const bad = cmd.startsWith('/') || /^[A-Za-z]:/.test(cmd) || cmd.startsWith('~') || cmd.includes('\\')
    || CONTROL.test(cmd) || cmd.split('/').some(s => s === '' || s === '..')
  return bad ? 'a path inside the pack must be relative, with no empty or ".." segments' : null
}

const fileEntry = z.strictObject({
  from: z.string().min(1).max(512),
  to: z.string().min(1).max(512),
  kind: z.enum(['skill', 'file']),
})

const envDecl = z.strictObject({
  name: envName,
  why: text(200),
  secret: z.boolean(),
})

const stdioServer = z.strictObject({
  name: serverName,
  type: z.literal('stdio'),
  command: z.string().min(1).max(260).superRefine((c, ctx) => {
    const e = commandError(c)
    if (e) ctx.addIssue({ code: 'custom', message: e })
  }),
  args: z.array(text(500)).max(50).default([]),
  env: z.array(envName).max(20).default([]),
})

const remoteServer = z.strictObject({
  name: serverName,
  type: z.enum(['http', 'sse']),
  url: z.string().max(2048),
})

export const ManifestSchema = z.strictObject({
  schema: z.literal(1),
  id: packId,
  name: text(60).min(1),
  version: semver,
  description: text(500),
  files: z.array(fileEntry).max(200),
  mcp: z.array(z.discriminatedUnion('type', [stdioServer, remoteServer])).max(10).default([]),
  hosts: z.array(hostname).max(50).default([]),
  env: z.array(envDecl).max(50).default([]),
  rules: z.strictObject({ text: z.string().min(1) }).optional(),
}).superRefine((m, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })

  const to = new Set<string>()
  m.files.forEach((f, i) => {
    if (to.has(f.to)) issue(['files', i, 'to'], `duplicate target ${f.to}`)
    to.add(f.to)
  })

  const hosts = new Set<string>()
  m.hosts.forEach((h, i) => {
    if (hosts.has(h)) issue(['hosts', i], `duplicate host ${h}`)
    hosts.add(h)
  })

  const envSet = new Set<string>()
  m.env.forEach((e, i) => {
    if (envSet.has(e.name)) issue(['env', i, 'name'], `duplicate env ${e.name}`)
    envSet.add(e.name)
  })

  const names = new Set<string>()
  m.mcp.forEach((s, i) => {
    if (names.has(s.name)) issue(['mcp', i, 'name'], `duplicate server ${s.name}`)
    names.add(s.name)

    if (s.type === 'stdio') {
      s.env.forEach((v, j) => {
        if (!envSet.has(v)) issue(['mcp', i, 'env', j], `${v} is not declared in env`)
      })
      const registries = REGISTRY_HOSTS[s.command]
      if (registries && !registries.some(h => hosts.has(h))) {
        issue(['mcp', i, 'command'], `${s.command} fetches packages: list ${registries[0]} in hosts`)
      }
      return
    }

    let u: URL
    try {
      u = new URL(s.url)
    } catch {
      issue(['mcp', i, 'url'], 'not a URL')
      return
    }
    const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost'
    if (u.protocol === 'http:' ? !local : u.protocol !== 'https:') {
      issue(['mcp', i, 'url'], 'must be https (http only for 127.0.0.1 or localhost)')
      return
    }
    if (!hosts.has(u.hostname)) issue(['mcp', i, 'url'], `host ${u.hostname} is not in hosts`)
  })

  if (m.rules && new TextEncoder().encode(m.rules.text).length > RULES_MAX_BYTES) {
    issue(['rules', 'text'], 'rules are larger than 8 KB')
  }
})

export type Manifest = z.infer<typeof ManifestSchema>
export type ManifestResult = { ok: true; manifest: Manifest } | { ok: false; errors: string[] }

// Validates the raw text of a pack.json. Errors read "path: message"; the root is "(root)".
export function parseManifest(raw: string): ManifestResult {
  if (new TextEncoder().encode(raw).length > MANIFEST_MAX_BYTES) {
    return { ok: false, errors: ['pack.json: larger than 64 KB'] }
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, errors: ['pack.json: not valid JSON'] }
  }
  const r = ManifestSchema.safeParse(data)
  if (r.success) return { ok: true, manifest: r.data }
  return {
    ok: false,
    errors: r.error.issues.map(i => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
  }
}
