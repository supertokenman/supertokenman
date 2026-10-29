#!/usr/bin/env node
// stm: SuperTokenMan from the command line. Talks to the running app over its local socket; every
// command prints for people, or JSON with --json. Messages go through the app's budget brake, and
// database queries from here are always read-only.
import { readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { PANEL_HELP, panelRequest, panelText } from './panelcmd.mjs'

const HELP = `stm, SuperTokenMan from the command line (the app must be running)

  stm status                         the app, its panels and today's spend
  stm panels                         open panels: id, folder, persona, busy
  stm eval [--models a,b] [--effort low,high] [--max-usd 1] [--yes]
                                     run .supertokenman/evals.txt on models and efforts; shows the plan, runs with --yes
  stm files export [--all]           write this project's triggers and their personas to .supertokenman/ (for git)
  stm files import [--yes]           show what the files there would change; --yes applies (triggers arrive off)
  stm new --template <id> [dir] [--replace CLAUDE.md,...]
                                     start a project from a template (web-app, cli-tool, data-analysis, docs-site); keeps files already there
  stm loop <build> <review> [--rounds 3] [--max-usd 2]
                                     review loop: each build reply goes to review and back until APPROVED or a limit
  stm loop stop <panel>              end the review loop that panel is in
  stm learn [--min 2] [--pick 1,3]   review notes from denials as proposed CLAUDE.local.md lines; --pick writes them
  stm send <panel|new> "text"        put a message in the panel's composer; the person sends it
                                     --now sends it at once and waits for the reply (--no-wait to return at once)
       [--cwd DIR] [--persona ID]    for "new": the folder and persona of the panel to open
  stm goal <panel> "condition"       set a panel's goal (stm goal <panel> clear ends it)
  stm key <NAME>                     print a provider key from the vault (Claude Code's apiKeyHelper)
  stm trace <panel>                  the panel's turns: why, tools, cost
  stm spend                          today's spend and limits
  stm top [--once] [--json]          live dashboard: panels, costs, approvals waiting, CI (q quits, ? help)
       [--currency USD|BRL]          --once --json prints one snapshot; exit 2 when the app is not running
  stm memory [--cwd DIR] "query"     the project's memory index for a query
  stm db <connection> "select ..."   a read-only query on a saved connection
  stm db list                        the saved connections
  stm triggers                       the triggers; stm triggers run <id> runs one
  stm mcp-run <server> -- <cmd>      runs an MCP server from the catalog with its keys from the vault
  stm ask test                       from a panel's Bash: run the tests, once approved in the panel
  stm ask scan deps|secrets          a dependency or secret scan of the panel's folder, once approved
  stm ask preview <local url>        show a local page in the panel's Preview tab, once approved
  stm transcript <url|file>          a video's transcript as text (--timestamps, --fresh); on in the app first
  stm mcp                            run as an MCP server (stdio) for other agents: status, panels, spend, memory, read-only SQL

  --json  machine-readable output     --help  this text`

const argv = process.argv.slice(2)
const flags = {}
const pos = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--json' || a === '--no-wait' || a === '--once' || a === '--now' || a === '--yes' || a === '--all' || a === '--help' || a === '-h') flags[a.replace(/^-+/, '')] = true
  else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i]
  else pos.push(a)
}
const json = Boolean(flags.json)
const die = (msg, code = 1) => {
  if (json) process.stdout.write(`${JSON.stringify({ ok: false, error: msg })}\n`)
  else process.stderr.write(`stm: ${msg}\n`)
  process.exit(code)
}
if (flags.help || flags.h || !pos.length || pos[0] === 'help') {
  process.stdout.write(`${HELP}\n\n${PANEL_HELP}\n`)
  process.exit(0)
}

let info
try {
  info = JSON.parse(readFileSync(join(process.env.STM_HOME ?? homedir(), '.supertokenman', 'cli.json'), 'utf8'))
} catch {
  die('SuperTokenMan is not running (no ~/.supertokenman/cli.json). Open the app first.', 2)
}

function call(cmd, args) {
  return new Promise((ok, fail) => {
    const s = connect(process.env.STM_SOCKET || info.socket)
    let buf = ''
    s.setEncoding('utf8')
    s.on('connect', () => s.write(`${JSON.stringify({ token: info.token, cmd, args })}\n`))
    s.on('data', (d) => {
      buf += d
      const nl = buf.indexOf('\n')
      if (nl >= 0) {
        s.end()
        const r = JSON.parse(buf.slice(0, nl))
        r.ok ? ok(r.data) : fail(new Error(r.error))
      }
    })
    s.on('error', () => fail(new Error('Could not reach the app. Is it running?')))
  })
}

const money = (usd) => `US$${Number(usd ?? 0).toFixed(4)}`
const pad = (s, n) => String(s ?? '').padEnd(n)
const [cmd, ...rest] = pos
const print = (data, human) => process.stdout.write(json ? `${JSON.stringify({ ok: true, data })}\n` : `${human(data)}\n`)

// The app as an MCP server, over stdio (newline-delimited JSON-RPC), written out by hand so it runs with
// plain node outside the app bundle. Reads only, except stm_send, which the app refuses unless you turned
// "let other agents send to panels" on in the app.
const TOOLS = [
  { name: 'stm_status', description: 'SuperTokenMan: version, open panels, how many are working, spend today.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'stm_panels', description: 'The open Claude Code panels: id, folder, persona, busy, goal.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'stm_spend', description: "Today's spend and the budget limits.", inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'stm_memory', description: "The project's memory index for a query: decisions, notes and where things are.", inputSchema: { type: 'object', properties: { cwd: { type: 'string', description: 'Project folder' }, query: { type: 'string' } }, required: ['cwd'] }, annotations: { readOnlyHint: true } },
  { name: 'stm_db_list', description: 'The saved database connections (names only, never credentials).', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'stm_db_query', description: 'A read-only SQL query on a saved connection; writes are refused.', inputSchema: { type: 'object', properties: { conn: { type: 'string' }, sql: { type: 'string' } }, required: ['conn', 'sql'] }, annotations: { readOnlyHint: true } },
  { name: 'stm_send', description: "Send a message to an open panel and wait for its reply. Off unless allowed in the app; goes through the app's budget brake.", inputSchema: { type: 'object', properties: { panel: { type: 'string' }, text: { type: 'string' } }, required: ['panel', 'text'] }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
]
async function mcpTool(name, a) {
  if (name === 'stm_status') return call('status', {})
  if (name === 'stm_panels') return call('panels', {})
  if (name === 'stm_spend') return call('spend', {})
  if (name === 'stm_memory') return call('memory', { cwd: String(a.cwd ?? ''), query: String(a.query ?? '') })
  if (name === 'stm_db_list') return call('dbList', {})
  if (name === 'stm_db_query') return call('db', { conn: String(a.conn ?? ''), sql: String(a.sql ?? '') })
  if (name === 'stm_send') return call('mcpSend', { panel: String(a.panel ?? ''), text: String(a.text ?? '') })
  throw new Error(`Unknown tool ${name}`)
}
function mcpServe() {
  return new Promise(() => {
    let buf = ''
    let chain = Promise.resolve() // lines are answered in order, and stdin closing waits for the last answer
    const out = (m) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`)
    process.stdin.setEncoding('utf8')
    const handle = async (m) => {
        try {
          if (m.method === 'initialize') out({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'supertokenman', version: '1.0.0' }, instructions: 'Read SuperTokenMan: panels, spend, project memory and read-only SQL. stm_send works only if the person allowed it in the app.' } })
          else if (m.method === 'ping') out({ id: m.id, result: {} })
          else if (m.method === 'tools/list') out({ id: m.id, result: { tools: TOOLS } })
          else if (m.method === 'tools/call') {
            try {
              const r = await mcpTool(m.params?.name, m.params?.arguments ?? {})
              out({ id: m.id, result: { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r, null, 2) }] } })
            } catch (e) {
              out({ id: m.id, result: { content: [{ type: 'text', text: e.message }], isError: true } })
            }
          } else out({ id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } })
        } catch (e) {
          out({ id: m.id, error: { code: -32603, message: e.message } })
        }
      }
    process.stdin.on('data', (d) => {
      buf += d
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let m
        try {
          m = JSON.parse(line)
        } catch {
          out({ id: null, error: { code: -32700, message: 'Parse error' } })
          continue
        }
        if (m.id === undefined) continue // notifications need no answer
        chain = chain.then(() => handle(m))
      }
    })
    process.stdin.on('end', () => void chain.then(() => process.exit(0)))
  })
}

let panelReq = null
try {
  panelReq = panelRequest(cmd, rest, flags, process.env)
} catch (e) {
  die(e.message)
}

try {
  if (panelReq) print(await call(panelReq.cmd, panelReq.args), (d) => panelText(panelReq.cmd, d))
  else if (cmd === 'top') {
    const { runTop } = await import('./top.mjs')
    let code
    try {
      code = await runTop(call, { json, once: Boolean(flags.once), currency: flags.currency })
    } catch (e) {
      die(e.message, 2)
    }
    process.exit(code)
  } else if (cmd === 'status') print(await call('status', {}), (d) => [`SuperTokenMan ${d.version}`, `${d.panels} panel${d.panels === 1 ? '' : 's'} open, ${d.busy} working`, `Spent today ${money(d.todayUsd)}`, `Headroom ${d.headroom ? 'on' : 'off'} · local model ${d.localModel ?? 'none'}`].join('\n'))
  else if (cmd === 'key') {
    // only for Claude Code's apiKeyHelper: the bare key on stdout, nothing else
    if (!rest[0]) die('Usage: stm key <NAME>')
    const d = await call('key', { name: rest[0] })
    process.stdout.write(`${d.key}\n`)
  } else if (cmd === 'mcp-run') {
    // an MCP server installed from the app's catalog: its keys come from the vault, only for it, at start
    const sep = process.argv.indexOf('--')
    const server = rest[0]
    if (!server || sep < 0 || !process.argv[sep + 1]) die('Usage: stm mcp-run <server> -- <command> [args]')
    const env = await call('mcpenv', { server })
    const { spawn } = await import('node:child_process')
    const child = spawn(process.argv[sep + 1], process.argv.slice(sep + 2), { stdio: 'inherit', env: { ...process.env, ...env } })
    child.on('exit', (code) => process.exit(code ?? 1))
    child.on('error', (e) => die(e.message))
  } else if (cmd === 'panels') print(await call('panels', {}), (d) => (d.length ? d.map((p) => `${pad(p.id, 5)} ${pad(p.busy ? 'working' : 'idle', 8)} ${pad(p.persona ?? '-', 12)} ${p.cwd}${p.goal ? `  goal: ${p.goal}` : ''}`).join('\n') : 'No panels open.'))
  else if (cmd === 'send') {
    const [panel, ...words] = rest
    const text = words.join(' ')
    if (!panel || !text) die('Usage: stm send <panel|new> "text"')
    print(await call('send', { panel, text, cwd: flags.cwd, persona: flags.persona, wait: !flags['no-wait'], queue: !flags.now }), (d) => (d.queued ? `Queued in ${d.panel}'s composer; press send there, or use --now.` : d.reply !== undefined ? d.reply : `Sent to ${d.panel}.`))
  } else if (cmd === 'eval') print(await call('evalRun', { cwd: flags.cwd || process.cwd(), models: flags.models, effort: flags.effort, maxUsd: flags['max-usd'], yes: Boolean(flags.yes) }), (d) => d.text)
  else if (cmd === 'loop') {
    // a loop sends between panels without the composer: the person starts it, not an agent in a panel
    if (process.env.STM_PANEL_ID && rest[0] !== 'stop') die('Start a review loop from your own terminal, not from inside a panel.')
    if (rest[0] === 'stop') {
      if (!rest[1]) die('Usage: stm loop stop <panel>')
      print(await call('loopStop', { panel: rest[1] }), (d) => d.text)
    } else {
      if (!rest[0] || !rest[1]) die('Usage: stm loop <build> <review> [--rounds 3] [--max-usd 2]')
      print(await call('loopStart', { build: rest[0], review: rest[1], rounds: flags.rounds, maxUsd: flags['max-usd'] }), (d) => d.text)
    }
  } else if (cmd === 'learn') print(await call('learn', { cwd: flags.cwd || process.cwd(), min: flags.min, pick: flags.pick }), (d) => d.text)
  else if (cmd === 'new') {
    if (!flags.template) die('Usage: stm new --template <web-app|cli-tool|data-analysis|docs-site> [dir]')
    print(await call('templateNew', { template: flags.template, dir: resolve(rest[0] ?? '.'), replace: flags.replace }), (d) => d.text)
  } else if (cmd === 'files') {
    const op = rest[0]
    if (op !== 'export' && op !== 'import') die('Usage: stm files export [--all]   or   stm files import [--yes]')
    print(await call(op === 'export' ? 'filesExport' : 'filesImport', { cwd: flags.cwd || process.cwd(), all: Boolean(flags.all), yes: Boolean(flags.yes) }), (d) => d.text)
  } else if (cmd === 'goal') {
    const [panel, ...words] = rest
    if (!panel || !words.length) die('Usage: stm goal <panel> "condition"   or   stm goal <panel> clear')
    print(await call('goal', { panel, text: words.join(' ') }), (d) => (d.goal ? `Goal of ${panel}: ${d.goal}` : `Goal of ${panel} cleared.`))
  } else if (cmd === 'trace') {
    if (!rest[0]) die('Usage: stm trace <panel>')
    print(await call('trace', { panel: rest[0] }), (d) => (d.turns.length ? d.turns.map((t) => `${t.id ?? ''}  ${new Date(t.at).toLocaleTimeString()}  ${money(t.costUsd)}  ${t.tools.length} tools  ${t.why ?? 'typed'}  ${t.prompt.replace(/\s+/g, ' ').slice(0, 60)}`).join('\n') : 'No turns yet.'))
  } else if (cmd === 'spend') print(await call('spend', {}), (d) => [`Today ${money(d.today)}`, ...Object.entries(d.limits).filter(([, v]) => v !== undefined).map(([k, v]) => `limit ${k}: ${k === 'warnAt' ? `${Math.round(v * 100)}%` : money(v)}`)].join('\n'))
  else if (cmd === 'memory') print(await call('memory', { cwd: flags.cwd ?? process.cwd(), query: rest.join(' ') }), (d) => d.text)
  else if (cmd === 'db') {
    if (rest[0] === 'list') print(await call('dbList', {}), (d) => (d.length ? d.map((c) => `${pad(c.id, 12)} ${pad(c.kind, 8)} ${c.name}`).join('\n') : 'No saved connections.'))
    else {
      const [conn, ...sql] = rest
      if (!conn || !sql.length) die('Usage: stm db <connection> "select ..."')
      print(await call('db', { conn, sql: sql.join(' ') }), (d) => (d.error ? `Error: ${d.error}` : d.columns.length ? [d.columns.join('\t'), ...d.rows.map((r) => r.map((v) => (v === null ? 'NULL' : String(v))).join('\t')), `(${d.count} rows${d.cut ? ', first 500' : ''})`].join('\n') : d.command ?? 'Done.'))
    }
  } else if (cmd === 'mcp') {
    await mcpServe()
  } else if (cmd === 'ask') {
    const panel = flags.panel ?? process.env.STM_PANEL
    if (!panel) die('stm ask runs from a panel (STM_PANEL is not set); or pass --panel <id>.')
    const [what, arg] = rest
    const kind = what === 'scan' ? (arg === 'deps' || arg === 'secrets' ? `scan-${arg}` : die('Usage: stm ask scan deps|secrets')) : what
    if (!['test', 'scan-deps', 'scan-secrets', 'preview'].includes(kind)) die('Usage: stm ask test | scan deps | scan secrets | preview <url>')
    const d = await call('ask', { panel, what: kind, url: what === 'preview' ? arg : undefined })
    print(d, (r) => (kind === 'test' ? [`${r.ok ? 'PASS' : 'FAIL'} ${r.cmd}: ${r.passed} passed, ${r.failed} failed (${(r.ms / 1000).toFixed(1)}s)`, r.ok ? '' : r.tail].filter(Boolean).join('\n') : kind === 'preview' ? `Shown in the Preview tab: ${r.shown}` : [`${r.findings} findings${r.critical !== undefined ? `, ${r.critical} critical` : ''}`, ...r.top].join('\n')))
    if (kind === 'test' && !d.ok) process.exitCode = 1
  } else if (cmd === 'triggers') {
    if (rest[0] === 'run') print(await call('triggerRun', { id: rest[1] }), () => `Started ${rest[1]}.`)
    else print(await call('triggers', {}), (d) => (d.length ? d.map((t) => `${pad(t.id, 12)} ${pad(t.enabled ? 'on' : 'off', 4)} ${t.name}`).join('\n') : 'No triggers.'))
  } else if (cmd === 'transcript') await (await import('./transcript.mjs')).runTranscript(call, { json })
  else die(`Unknown command "${cmd}". Try: stm help`)
} catch (e) {
  die(e.message)
}
