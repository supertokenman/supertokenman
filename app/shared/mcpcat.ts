// The MCP catalog, the parts with no network: the awesome-mcp-servers list (MIT) read into entries with
// its own markers (official, language, local or cloud, OS), the install config found in a server's
// README, and a review that says what to look at before running a stranger's code on this machine.
// Each listed server has its own license; the review reads it from the server's repo.

export type Entry = { name: string; repo: string; url: string; category: string; official: boolean; langs: string[]; scope: string[]; os: string[]; description: string }

const LANGS: [string, string][] = [['🐍', 'Python'], ['📇', 'TypeScript'], ['🏎️', 'Go'], ['🦀', 'Rust'], ['#️⃣', 'C#'], ['☕', 'Java'], ['🌊', 'C/C++'], ['💎', 'Ruby']]
const SCOPE: [string, string][] = [['☁️', 'cloud'], ['🏠', 'local'], ['📟', 'embedded']]
const OS: [string, string][] = [['🍎', 'macOS'], ['🪟', 'Windows'], ['🐧', 'Linux']]

/** The README's server sections as entries; links to other lists, clients and tutorials are left out. */
export function parseList(md: string): Entry[] {
  const out: Entry[] = []
  let category = ''
  let inServers = false
  for (const line of md.split('\n')) {
    if (/^## /.test(line)) inServers = /Server Implementations/i.test(line)
    const h = /^### .*?(?:<\/a>)\s*(.+)$/.exec(line) ?? /^### (?:\S+\s+)?(.+)$/.exec(line)
    if (/^### /.test(line) && h) {
      category = h[1]!.replace(/<[^>]+>/g, '').trim()
      continue
    }
    if (!inServers || !category) continue
    const m = /^\s*[-*] \[([^\]]+)\]\((https:\/\/github\.com\/([\w.-]+\/[\w.-]+))[^)]*\)(.*)$/.exec(line)
    if (!m) continue
    const rest = m[4]!.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    const dash = rest.search(/\s[-–—]\s/)
    const marks = dash >= 0 ? rest.slice(0, dash) : rest
    const description = (dash >= 0 ? rest.slice(dash).replace(/^\s[-–—]\s/, '') : '').trim()
    const has = (e: string) => marks.includes(e)
    out.push({ name: m[1]!.trim(), repo: m[3]!.replace(/\.git$/, ''), url: m[2]!, category, official: has('🎖️') || has('🎖'), langs: LANGS.filter(([e]) => has(e)).map(([, n]) => n), scope: SCOPE.filter(([e]) => has(e)).map(([, n]) => n), os: OS.filter(([e]) => has(e)).map(([, n]) => n), description })
  }
  return out
}

export type Filter = { q?: string; category?: string; lang?: string; scope?: string; official?: boolean }
export function filterList(list: Entry[], f: Filter, limit = 80): Entry[] {
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return list
    .filter((e) => (!f.category || e.category === f.category) && (!f.lang || e.langs.includes(f.lang)) && (!f.scope || e.scope.includes(f.scope)) && (!f.official || e.official))
    .map((e) => {
      const hay = `${e.name} ${e.repo} ${e.description} ${e.category}`.toLowerCase()
      return { e, ok: words.every((w) => hay.includes(w)), s: words.filter((w) => `${e.name} ${e.repo}`.toLowerCase().includes(w)).length + (e.official ? 0.5 : 0) }
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e)
}

export type Config = { name: string; command?: string; args?: string[]; url?: string; type?: 'stdio' | 'http' | 'sse'; env: string[] }

/** The first mcpServers block in a README (the Claude Desktop config most servers show), plus env names. */
export function configOf(readme: string): Config | null {
  for (const block of readme.matchAll(/```(?:json|jsonc)?\s*\n([\s\S]*?)```/g)) {
    const text = block[1]!.replace(/(^|[\s,{[])\/\/[^\n]*/gm, '$1').replace(/,(\s*[}\]])/g, '$1')
    if (!/"mcpServers"|"servers"/.test(text)) continue
    try {
      const j = JSON.parse(text) as { mcpServers?: Record<string, Record<string, unknown>>; servers?: Record<string, Record<string, unknown>> }
      const [name, s] = Object.entries(j.mcpServers ?? j.servers ?? {})[0] ?? []
      if (!name || !s) continue
      const url = typeof s.url === 'string' ? s.url : typeof s.serverUrl === 'string' ? s.serverUrl : undefined
      return { name, ...(typeof s.command === 'string' ? { command: s.command } : {}), ...(Array.isArray(s.args) ? { args: s.args.map(String) } : {}), ...(url ? { url, type: s.type === 'sse' ? 'sse' : 'http' } : { type: 'stdio' }), env: Object.keys((s.env ?? s.headers ?? {}) as object) }
    } catch {
      continue
    }
  }
  return null
}

export type Review = { level: 'ok' | 'look' | 'stop'; notes: { tone: 'ok' | 'look' | 'stop'; text: string }[] }
const BROAD = /\b(shell|exec(?:ute)?|terminal|command line|filesystem|file system|any file|browser automation|keyboard|mouse|screen|computer use|sudo|root)\b/i
const ANY_CMD = /\b(bash|sh|zsh|powershell|cmd)\b/

/** What to look at before installing: license, who publishes it, how it runs, and what it can reach. */
export function review(e: Pick<Entry, 'official' | 'description' | 'scope'>, license: string | null, cfg: Config | null, pushedDaysAgo: number | null): Review {
  const notes: Review['notes'] = []
  notes.push(e.official ? { tone: 'ok', text: 'Official: published by the company behind the service.' } : { tone: 'look', text: 'Community server: someone other than the service wrote it. Read its code before giving it keys.' })
  if (!license) notes.push({ tone: 'stop', text: 'No LICENSE file found in its repo: without one you have no right to use or change it.' })
  else if (/AGPL|GPL/i.test(license)) notes.push({ tone: 'look', text: `${license}: fine to run as a separate program; do not copy its code into yours.` })
  else notes.push({ tone: 'ok', text: `License: ${license}.` })
  if (pushedDaysAgo != null && pushedDaysAgo > 365) notes.push({ tone: 'look', text: `No change in ${Math.round(pushedDaysAgo / 30)} months: it may not follow MCP updates or security fixes.` })
  if (!cfg) notes.push({ tone: 'look', text: 'No ready config in its README; you write the command yourself.' })
  else if (cfg.url) notes.push({ tone: e.scope.includes('cloud') ? 'ok' : 'look', text: `Remote server at ${cfg.url.replace(/[?#].*$/, '')}: what you send goes to that host.` })
  else {
    const run = [cfg.command, ...(cfg.args ?? [])].join(' ')
    if (/\bnpx\b|\buvx\b|\bpipx\b|\bbunx\b/.test(run) && !/@\d|==\d/.test(run)) notes.push({ tone: 'look', text: `Runs ${run.split(' ').slice(0, 3).join(' ')} without a fixed version: each start may fetch new code. Pin a version.` })
    if (/\bdocker\b/.test(run)) notes.push({ tone: 'ok', text: 'Runs in Docker: kept apart from your files unless it mounts them.' })
    if (ANY_CMD.test(cfg.command ?? '')) notes.push({ tone: 'stop', text: 'Starts a shell: check what it runs.' })
  }
  if (BROAD.test(e.description)) notes.push({ tone: 'look', text: 'Says it can reach your shell, files, browser or screen: give it only what the task needs.' })
  if (cfg?.env.length) notes.push({ tone: 'ok', text: `Needs ${cfg.env.join(', ')}: saved in the vault and given to the server when it starts, never written into a config file.` })
  const level = notes.some((n) => n.tone === 'stop') ? 'stop' : notes.some((n) => n.tone === 'look') ? 'look' : 'ok'
  return { level, notes }
}

/** A server name Claude Code accepts. */
export const serverName = (s: string) => s.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'server'
