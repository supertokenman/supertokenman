// The Mac proof's report, from the raw logs of one run: the same sections as proof-mac.sh writes, plus
// the hosts in Chromium's net log and the host names mitmproxy saw in --names mode. Fails (exit 1) when
// the decoy is found anywhere, or when the app's own processes reach a host outside docs/NETWORK.md.
// Claude Code and the MCP servers it starts are listed, not judged: where they go is Claude Code's job.
//
//   node scripts/proof-report.mjs <run dir> <docs/NETWORK.md>
//
// The parsing is in small pure functions, tested in proof-report.test.ts.
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const LOOPBACK = /^(127\.|\[?::1\]?$|localhost$|0\.0\.0\.0$)/

/** Every host name written in the network doc: those are the places the app may reach. */
export function allowedHosts(md) {
  const found = String(md).toLowerCase().match(/\b(?:[a-z0-9-]+\.)+(?:com|dev|org|io|net|sh|ai|app|co)\b/g) ?? []
  return [...new Set(found)].sort()
}

/** A host (port dropped) is allowed when it is in the list or under one of its names. */
export function hostAllowed(host, allowed) {
  const h = String(host).toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  return allowed.some((a) => h === a || h.endsWith('.' + a))
}

const count = (items) => {
  const m = new Map()
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([host, n]) => ({ host, n }))
}

/** Hosts in Chromium's net log: what the window and the app's Electron requests asked for. */
export function netlogHosts(text) {
  const hosts = [...String(text).matchAll(/"(?:https?|wss?):\/\/([^/"?#]+)/g)].map((m) => m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase())
  return count(hosts.filter((h) => !LOOPBACK.test(h)))
}

/** Host names mitmproxy connected to, from its log in --names (passthrough) mode. */
export function mitmNames(text) {
  const hosts = [...String(text).matchAll(/server connect ([^\s()]+)/g)].map((m) => m[1].replace(/:\d+$/, '').toLowerCase())
  return count(hosts.filter((h) => !LOOPBACK.test(h)))
}

/** Hosts whose client refused the proxy's certificate. */
export function refusedHosts(text) {
  return count([...String(text).matchAll(/does not trust the proxy's certificate for (\S+)/g)].map((m) => m[1]))
}

/** The app's own processes (the main one and its helpers), by lsof's 9-character command name. */
export const isAppProcess = (cmd) => /^SuperToke/.test(String(cmd))

/**
 * Remote endpoints from connections.log (lines: time command pid type name [state]), loopback left
 * out, each with the processes that opened it and whether one of them is the app's own.
 */
export function endpoints(text) {
  const m = new Map()
  for (const line of String(text).split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 5) continue
    const remote = f[4].split('->')[1]
    if (!remote || remote.startsWith('*')) continue
    const ip = remote.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
    if (LOOPBACK.test(ip)) continue
    const e = m.get(remote) ?? { remote, ip, port: remote.split(':').pop(), procs: new Set(), app: false }
    e.procs.add(f[1])
    if (isAppProcess(f[1])) e.app = true
    m.set(remote, e)
  }
  return [...m.values()].map((e) => ({ ...e, procs: [...e.procs].sort() }))
}

/**
 * What fails the run. The app's traffic goes through the proxy, so its hosts are in the net log; a
 * direct connection of an app process is allowed only when its reverse name is under an allowed host.
 */
export function verdict({ decoyHits, netlog, appDirect, allowed }) {
  const fail = []
  for (const f of decoyHits) fail.push(`the decoy was found in ${f}`)
  for (const { host } of netlog) if (!hostAllowed(host, allowed)) fail.push(`the app asked for ${host}, which is not in docs/NETWORK.md`)
  for (const e of appDirect) if (!e.name || !hostAllowed(e.name, allowed)) fail.push(`an app process connected to ${e.remote}${e.name ? ` (${e.name})` : ' (no name)'}, which is not in docs/NETWORK.md`)
  return fail
}

const block = (rows, none) => '```\n' + (rows.length ? rows.map((r) => `${String(r.n).padStart(4)} ${r.host}`).join('\n') : none) + '\n```'

/** REPORT.md from what the run gathered. */
export function render(d) {
  const table = d.endpoints.map((e) => `| ${e.ip} | ${e.port} | ${e.name || '-'} | ${e.org || '-'} | ${e.procs.join(' ')} |`).join('\n')
  return `# Mac proof: SuperTokenMan ${d.version}

Run on ${d.system}, ${d.date}, by the \`proof-mac\` workflow (${d.run}), with nobody at the keyboard.
Traffic went through mitmproxy in \`--names\` mode: TLS is passed through unopened, so host names are
logged and content is not read.

**Result: ${d.fail.length ? 'FAILED' : 'passed'}.**${d.fail.length ? '\n\n' + d.fail.map((f) => `- ${f}`).join('\n') : ''}

## The download

\`\`\`
${d.checks.trim()}
\`\`\`

## What was done in the app

Driven over Chromium's debugging port on loopback (\`app/scripts/proof-drive.mjs\`), in this order:
DECOY_KEY added to the vault with "Commands can read it", a panel opened, "run echo hello and tell me
the date" sent, the command allowed, the reply waited for, the app closed.

- Vault: ${d.drive.vault}
- Panel: ${d.drive.panel}
- Claude turn: ${d.drive.claude}
- Command: ${d.drive.command}
${d.drive.reply ? `- Reply: ${d.drive.reply.replace(/\s+/g, ' ')}\n` : ''}${d.drive.error ? `- Error: ${d.drive.error}\n` : ''}
## Where the app and its processes connected

Every TCP and UDP connection of the app and of every process it started, sampled twice a second with
\`lsof\`. Loopback is left out, and so is the app's traffic to the proxy. The name is the reverse DNS; the
owner is the first organisation line in \`whois\`.

| Address | Port | Name | Owner | Processes |
|---|---|---|---|---|
${table || '| none | | | | |'}

Raw: \`connections.log\`, \`processes.log\`.

## Host names through the proxy

Every host the app and its processes connected to through mitmproxy (\`mitm.log\`):

${block(d.names, 'none')}

Hosts the app itself asked for, from Chromium's net log (\`netlog.json\`): the window, its web views and
the main process's Electron requests. These are checked against docs/NETWORK.md; a host only in the
list above belongs to a process the app started (Claude Code, its MCP servers, git).

${block(d.netlog, 'none')}

Refused the proxy's certificate:

${block(d.refused, 'none')}

## The decoy secret

A value made for this run was put in the vault as DECOY_KEY.

- On disk, in this run's profile, Claude Code's config folder and every log of the run, outside
  \`decoy.txt\`: ${d.decoyHits.length ? 'FOUND in:\n' + d.decoyHits.map((f) => `  - ${f}`).join('\n') : 'not found'}
- In the network traffic: not readable (\`--names\` passes TLS through unopened)

## What this does not show

- A sample twice a second can miss a connection that opens and closes in between.
- The destinations are known, not what was sent to them.
- The runner is a clean macOS VM with no MCP servers or plugins of its own; a person's Mac may run more.
- Claude Code sends the message to Anthropic; that is its job and it is listed on the Security page.
`
}

/** Files under dir whose bytes contain needle; the skip list is left out. */
export function filesWith(dir, needle, skip = []) {
  const hits = []
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      let s
      try { s = statSync(p) } catch { continue }
      if (s.isDirectory()) walk(p)
      else if (s.isFile() && !skip.includes(p)) {
        try { if (readFileSync(p).includes(needle)) hits.push(p) } catch { /* unreadable */ }
      }
    }
  }
  if (existsSync(dir)) walk(dir)
  return hits
}

const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, doc] = process.argv.slice(2)
  const decoy = read(join(dir, 'decoy.txt')).trim()
  if (!decoy) { console.error('proof-report: no decoy.txt'); process.exit(2) }
  const allowed = allowedHosts(read(doc))
  const eps = endpoints(read(join(dir, 'connections.log'))).map((e) => ({
    ...e,
    name: (sh('host', [e.ip]).match(/pointer (\S+)/)?.[1] ?? '').replace(/\.$/, ''),
    org: sh('whois', [e.ip]).split('\n').map((l) => l.match(/^(?:OrgName|org-name|descr|netname):\s*(.+)/i)?.[1]).find(Boolean) ?? '',
  }))
  const decoyHits = filesWith(dir, decoy, [join(dir, 'decoy.txt')]).map((p) => relative(dir, p))
  const netlog = netlogHosts(read(join(dir, 'netlog.json')))
  const appDirect = eps.filter((e) => e.app)
  const fail = verdict({ decoyHits, netlog, appDirect, allowed })
  const drive = existsSync(join(dir, 'drive.json')) ? JSON.parse(read(join(dir, 'drive.json'))) : { vault: 'not run', panel: 'not run', claude: 'not run', command: 'not run' }
  const md = render({
    version: read(join(dir, 'version.txt')).trim() || 'unknown',
    system: read(join(dir, 'system.txt')).trim() || 'macOS',
    date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    run: process.env.GITHUB_SERVER_URL ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local',
    checks: read(join(dir, 'checks.log')),
    drive,
    endpoints: eps,
    names: mitmNames(read(join(dir, 'mitm.log'))),
    netlog,
    refused: refusedHosts(read(join(dir, 'mitm.log'))),
    decoyHits,
    fail,
  })
  writeFileSync(join(dir, 'REPORT.md'), md)
  console.log(fail.length ? `proof: FAILED\n${fail.map((f) => '  ' + f).join('\n')}` : 'proof: passed')
  process.exit(fail.length ? 1 : 0)
}
