// A panel in a sandbox: Claude Code runs inside an OpenShell sandbox instead of on the Mac. The project is
// copied in, the kernel keeps the agent to that copy, and the network to the hosts the policy names. The
// Claude credential never enters the sandbox: OpenShell gives the agent a placeholder and swaps in the real
// value only on requests to Anthropic. Changes come back only when you bring them back, after seeing them.
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import type { SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'

export const IMAGE = 'stm-claude:1'
export const PROVIDER = 'stm-claude'
export const WORKDIR = '/sandbox'

/** The image the sandbox starts from: Node, git and Claude Code, nothing else. */
export const DOCKERFILE = `FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates ripgrep && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force
`

/** Claude Code as a provider: the credential is used on Anthropic's hosts and nowhere else. */
export const PROFILE = `id: ${PROVIDER}
display_name: Claude Code (SuperTokenMan)
description: Claude Code in a SuperTokenMan sandbox
category: agent
inference_capable: true
credentials:
  - name: api_key
    description: Anthropic API key, or a Claude Code token from claude setup-token
    env_vars: [ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN]
    required: true
    auth_style: header
    header_name: x-api-key
discovery:
  credentials: [api_key]
endpoints:
  - host: api.anthropic.com
    port: 443
    protocol: rest
    access: read-write
    enforcement: enforce
binaries: [/usr/local/bin/claude, /usr/local/bin/node, /usr/local/lib/node_modules/@anthropic-ai/**]
`

/** What else the agent may reach: package registries and GitHub, to read. */
export const POLICY = `version: 1
filesystem_policy:
  include_workdir: true
  read_only: [/bin, /usr, /lib, /proc, /dev/urandom, /etc, /var/log]
  read_write: [${WORKDIR}, /tmp, /dev/null]
landlock:
  compatibility: best_effort
network_policies:
  packages:
    name: packages-read
    endpoints:
      - { host: registry.npmjs.org, port: 443, protocol: rest, enforcement: enforce, access: read-only }
      - { host: pypi.org, port: 443, protocol: rest, enforcement: enforce, access: read-only }
      - { host: files.pythonhosted.org, port: 443, protocol: rest, enforcement: enforce, access: read-only }
    binaries:
      - { path: /usr/local/bin/node }
  github:
    name: github-read
    endpoints:
      - { host: github.com, port: 443, protocol: rest, enforcement: enforce, access: read-only }
      - { host: api.github.com, port: 443, protocol: rest, enforcement: enforce, access: read-only }
      - { host: codeload.github.com, port: 443, protocol: rest, enforcement: enforce, access: read-only }
    binaries:
      - { path: /usr/bin/git }
      - { path: /usr/lib/git-core/git-remote-https }
      - { path: /usr/local/bin/node }
`

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
const BIN = () => process.env.STM_OPENSHELL || 'openshell'

type Run = (args: string[], env?: NodeJS.ProcessEnv, timeout?: number) => Promise<{ ok: boolean; out: string }>
const run: Run = (args, env, timeout = 120_000) =>
  new Promise((ok) =>
    execFile(BIN(), args, { timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...env } }, (e, out, err) => ok({ ok: !e, out: `${out ?? ''}${err ?? ''}`.trim() })),
  )
const docker = (args: string[], timeout = 15 * 60_000) =>
  new Promise<{ ok: boolean; out: string }>((ok) => execFile('docker', args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => ok({ ok: !e, out: `${out ?? ''}${err ?? ''}`.trim() })))

/** One sandbox per project folder, with a name that is stable and safe. */
export function sandboxName(cwd: string) {
  const slug = basename(cwd).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'project'
  return `stm-${slug}-${createHash('sha256').update(cwd).digest('hex').slice(0, 6)}`
}
/** Where the project lives inside its sandbox. */
export const innerDir = (cwd: string) => `${WORKDIR}/${basename(cwd) || 'project'}`

export type SandboxStatus = { installed: boolean; version?: string; gateway: boolean; detail?: string }

export async function sandboxStatus(): Promise<SandboxStatus> {
  const v = await run(['--version'], undefined, 8000)
  if (!v.ok) return { installed: false, gateway: false }
  const g = await run(['status'], undefined, 8000)
  return { installed: true, version: v.out.split('\n')[0], gateway: g.ok, detail: g.ok ? undefined : g.out.split('\n').slice(-2).join(' ').slice(0, 300) }
}

/**
 * Everything a sandbox needs, done once and checked each time: the image, the provider (its credential
 * read from the vault only when OpenShell does not have it yet, and passed by environment, never a command line), the sandbox, and the project copied in.
 */
export async function prepareSandbox(cwd: string, credential: () => { name: 'ANTHROPIC_API_KEY' | 'CLAUDE_CODE_OAUTH_TOKEN'; value: string }, dir: string, log: (line: string) => void) {
  const name = sandboxName(cwd)
  mkdirSync(dir, { recursive: true })
  if (!(await docker(['image', 'inspect', IMAGE], 15_000)).ok) {
    log('Building the sandbox image (once)…')
    const ctx = join(dir, 'image')
    mkdirSync(ctx, { recursive: true })
    writeFileSync(join(ctx, 'Dockerfile'), DOCKERFILE)
    const b = await docker(['build', '-t', IMAGE, ctx])
    if (!b.ok) throw new Error(`The sandbox image did not build: ${b.out.slice(-400)}`)
  }
  const profile = join(dir, 'provider.yaml')
  writeFileSync(profile, PROFILE)
  const policy = join(dir, 'policy.yaml')
  writeFileSync(policy, POLICY)
  if (!(await run(['provider', 'get', PROVIDER], undefined, 15_000)).ok) {
    log('Registering Claude Code with OpenShell…')
    const imp = await run(['provider', 'profile', 'import', '-f', profile, '--global'], undefined, 30_000)
    if (!imp.ok && !/exist/i.test(imp.out)) throw new Error(`OpenShell refused the provider profile: ${imp.out.slice(-300)}`)
    // asked for only now: once OpenShell keeps it, the vault is not read again
    const cred = credential()
    // the bare key form: OpenShell reads the value from this process's environment
    const c = await run(['provider', 'create', '--name', PROVIDER, '--type', PROVIDER, '--credential', cred.name], { [cred.name]: cred.value }, 30_000)
    if (!c.ok) throw new Error(`OpenShell did not keep the credential: ${c.out.slice(-300)}`)
  }
  if (!(await run(['sandbox', 'get', name], undefined, 15_000)).ok) {
    log('Starting the sandbox…')
    const s = await run(['sandbox', 'create', '--name', name, '--from', IMAGE, '--provider', PROVIDER, '--policy', policy, '--detach', '--', 'sleep', 'infinity'], undefined, 5 * 60_000)
    if (!s.ok) throw new Error(`The sandbox did not start: ${s.out.slice(-400)}`)
    log('Copying the project in…')
    // upload puts the folder inside the destination, and leaves out what .gitignore names
    const u = await run(['sandbox', 'upload', name, cwd, WORKDIR], undefined, 10 * 60_000)
    if (!u.ok) throw new Error(`The project was not copied in: ${u.out.slice(-300)}`)
  }
  return name
}

/** The executable and its arguments the SDK asked for, as Claude Code inside the sandbox runs them. */
export function innerArgs(command: string, args: string[]) {
  // the SDK runs either `node cli.js …` or a native `claude …`; inside, it is always `claude …`
  if (/(^|\/)(node|bun)(\.exe)?$/.test(command) && args[0] && /\.(c|m)?js$/.test(args[0])) return args.slice(1)
  return args
}

/** Claude Code in the sandbox, speaking the SDK's protocol over the exec channel's stdin and stdout. */
export function spawnInSandbox(name: string, cwd: string) {
  return (o: SpawnOptions): SpawnedProcess => {
    const args = innerArgs(o.command, o.args)
    // only what Claude Code needs about the session; the Mac's environment stays on the Mac
    const pass = ['CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_AGENT_SDK_VERSION', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'MAX_THINKING_TOKENS', 'ANTHROPIC_MODEL']
    const env = pass.flatMap((k) => (o.env[k] ? ['--env', `${k}=${o.env[k]}`] : []))
    const child = spawn(BIN(), ['sandbox', 'exec', '-n', name, '--no-login-shell', ...env, '--', 'sh', '-c', `cd ${quote(innerDir(cwd))} && exec claude "$@"`, 'claude', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: o.signal,
    })
    return child as unknown as SpawnedProcess
  }
}

export type Change = { path: string; kind: 'added' | 'changed' | 'deleted' }

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', '__pycache__', '.turbo', '.cache'])
function files(root: string, out = new Map<string, string>(), d = root) {
  let list: string[] = []
  try {
    list = readdirSync(d)
  } catch {
    return out
  }
  for (const n of list) {
    if (SKIP.has(n)) continue
    const p = join(d, n)
    const st = statSync(p, { throwIfNoEntry: false })
    if (!st) continue
    if (st.isDirectory()) files(root, out, p)
    else if (st.isFile() && st.size < 20 * 1024 * 1024) out.set(relative(root, p), p)
  }
  return out
}

/** What differs between the sandbox's copy and the folder on the Mac. */
export function diffTrees(inside: string, outside: string): Change[] {
  const a = files(inside)
  const b = files(outside)
  const out: Change[] = []
  for (const [rel, p] of a) {
    const q = b.get(rel)
    if (!q) out.push({ path: rel, kind: 'added' })
    else if (!readFileSync(p).equals(readFileSync(q))) out.push({ path: rel, kind: 'changed' })
  }
  for (const rel of b.keys()) if (!a.has(rel)) out.push({ path: rel, kind: 'deleted' })
  return out.sort((x, y) => x.path.localeCompare(y.path))
}

const pulled = new Map<string, string>()

/** The sandbox's copy, downloaded to a temporary folder, and how it differs. */
export async function pullChanges(name: string, cwd: string): Promise<Change[]> {
  const old = pulled.get(name)
  if (old) rmSync(old, { recursive: true, force: true })
  const tmp = mkdtempSync(join(tmpdir(), 'stm-sbx-'))
  const d = await run(['sandbox', 'download', name, innerDir(cwd), tmp], undefined, 10 * 60_000)
  if (!d.ok) throw new Error(`Could not read the sandbox's copy: ${d.out.slice(-300)}`)
  // download may nest the folder under its own name
  const nested = join(tmp, basename(innerDir(cwd)))
  const root = existsSync(nested) && statSync(nested).isDirectory() && !existsSync(join(tmp, 'package.json')) ? nested : tmp
  pulled.set(name, root)
  return diffTrees(root, cwd)
}

/** The picked changes, written into the project on the Mac. Deletions only when asked for by path. */
export function applyChanges(name: string, cwd: string, paths: string[]) {
  const root = pulled.get(name)
  if (!root) throw new Error('Look at the changes first.')
  const changes = new Map(diffTrees(root, cwd).map((c) => [c.path, c]))
  let n = 0
  for (const p of paths) {
    const c = changes.get(p)
    if (!c || p.split(/[\\/]/).includes('..')) continue
    const dst = join(cwd, p)
    if (c.kind === 'deleted') rmSync(dst, { force: true })
    else {
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(join(root, p), dst)
    }
    n++
  }
  return n
}

/** The sandbox and its copy gone; the project on the Mac untouched. */
export async function removeSandbox(cwd: string) {
  const r = await run(['sandbox', 'delete', sandboxName(cwd)], undefined, 60_000)
  return r.ok
}
