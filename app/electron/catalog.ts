// The live catalog: plugins from the person's marketplaces (through the claude CLI), skills on disk,
// MCP servers from the official registry, and GitHub repositories. Search ranks across all of them.
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Item = {
  source: 'plugin' | 'skill' | 'mcp' | 'github'
  id: string
  name: string
  description: string
  where: string
  installed?: boolean
  url?: string
  stars?: number
  /** a pick of ours: why it is here, and the marketplace to add before installing */
  pick?: { why: string; license: string; market?: string }
  /** for an MCP server: how to run it, when the registry says */
  mcp?: { remote?: string; needsAuth: boolean; npm?: string }
}

export type Run = (args: string[]) => Promise<string>
export type Fetch = (url: string, headers?: Record<string, string>) => Promise<unknown>

export const runClaude: Run = (args) =>
  new Promise((resolve, reject) =>
    execFile('claude', args, { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout))),
  )

/**
 * Plugins we recommend for this app's purpose: fewer tokens and better work per session. Each comes
 * from its own marketplace, added the first time it is installed.
 */
export const PICKS: Item[] = [
  {
    source: 'plugin',
    id: 'caveman@caveman',
    name: 'caveman',
    description: 'Shorter answers with code and errors kept exact, and logs, JSON and test output compressed before the model reads them.',
    where: 'JuliusBrussee/caveman',
    url: 'https://github.com/JuliusBrussee/caveman',
    pick: { why: 'Terse answers: final replies about two thirds shorter in our test. On a read-the-code task the total cost did not drop (output is mostly tool calls) and one answer in three came back incomplete.', license: 'Apache-2.0', market: 'JuliusBrussee/caveman' },
  },
  {
    source: 'plugin',
    id: 'superpowers@superpowers-marketplace',
    name: 'superpowers',
    description: 'Skills for a disciplined way of working: brainstorm, plan, test first, review, then finish the branch.',
    where: 'obra/superpowers',
    url: 'https://github.com/obra/superpowers',
    pick: { why: 'Fewer wasted turns: Claude plans and checks its work before writing code.', license: 'MIT', market: 'obra/superpowers-marketplace' },
  },
  {
    source: 'plugin',
    id: 'hyperframes@hyperframes',
    name: 'hyperframes',
    description: 'Videos written as HTML: scenes, captions, overlays and motion, rendered to MP4 by the HyperFrames CLI. The tour chapter of this app was made with it.',
    where: 'heygen-com/hyperframes',
    url: 'https://github.com/heygen-com/hyperframes',
    pick: { why: 'Claude can make and edit a video the same way it edits a page; rendering runs on this machine.', license: 'Apache-2.0', market: 'heygen-com/hyperframes' },
  },
  {
    source: 'plugin',
    id: 'ruflo-core@ruflo',
    name: 'ruflo-core',
    description: 'Ruflo: agents, swarms and MCP tools that plan work, split it and coordinate across agents.',
    where: 'ruvnet/ruflo',
    url: 'https://github.com/ruvnet/ruflo',
    pick: { why: 'For big tasks split across several agents. More agents means more turns: watch Spend, and try it on one project before turning it on everywhere.', license: 'MIT', market: 'ruvnet/ruflo' },
  },
]

/** The picks, marked installed when the plugin list says so. */
export const withPicks = (items: Item[]) => [...PICKS.map((p) => ({ ...p, installed: items.some((i) => i.source === 'plugin' && i.id === p.id && i.installed) })), ...items.filter((i) => !PICKS.some((p) => p.id === i.id))]

/** Installed and available plugins. */
export async function plugins(run: Run = runClaude): Promise<Item[]> {
  const j = JSON.parse(await run(['plugin', 'list', '--available', '--json'])) as {
    installed?: { id: string; version?: string; enabled?: boolean }[]
    available?: { pluginId: string; name: string; description?: string; marketplaceName: string; version?: string; source?: { url?: string } }[]
  }
  const installed = new Set((j.installed ?? []).map((p) => p.id))
  const seen = new Set<string>()
  const out: Item[] = []
  for (const p of j.available ?? []) {
    seen.add(p.pluginId)
    out.push({ source: 'plugin', id: p.pluginId, name: p.name, description: p.description ?? '', where: p.marketplaceName, installed: installed.has(p.pluginId), url: p.source?.url?.replace(/\.git$/, '') })
  }
  for (const p of j.installed ?? []) if (!seen.has(p.id)) out.push({ source: 'plugin', id: p.id, name: p.id.split('@')[0]!, description: '', where: p.id.split('@')[1] ?? '', installed: true })
  return out
}

/** Skills in the person's and the project's skills folders: name and description from SKILL.md. */
export function skills(cwd: string, home = homedir()): Item[] {
  const out: Item[] = []
  for (const [dir, where] of [[join(home, '.claude', 'skills'), 'personal'], [join(cwd, '.claude', 'skills'), 'project']] as const) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      const file = join(dir, name, 'SKILL.md')
      if (!existsSync(file)) continue
      const head = readFileSync(file, 'utf8').slice(0, 4000)
      const front = head.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
      const field = (k: string) => front.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '').trim()
      out.push({ source: 'skill', id: `${where}:${name}`, name: field('name') || name, description: field('description') || '', where, installed: true })
    }
  }
  return out
}

/** MCP servers from the official registry. */
export async function mcpServers(q: string, fetchJson: Fetch): Promise<Item[]> {
  const j = (await fetchJson(`https://registry.modelcontextprotocol.io/v0/servers?search=${encodeURIComponent(q)}&limit=30`)) as {
    servers?: { server: { name: string; description?: string; repository?: { url?: string }; remotes?: { type: string; url: string; headers?: { isRequired?: boolean }[] }[]; packages?: { registryType?: string; identifier?: string }[] } }[]
  }
  const out: Item[] = []
  const seen = new Set<string>()
  for (const { server: s } of j.servers ?? []) {
    if (seen.has(s.name)) continue
    seen.add(s.name)
    const remote = s.remotes?.find((r) => r.type === 'streamable-http') ?? s.remotes?.[0]
    const npm = s.packages?.find((p) => p.registryType === 'npm')?.identifier
    out.push({
      source: 'mcp',
      id: s.name,
      name: s.name.split('/').pop() ?? s.name,
      description: s.description ?? '',
      where: s.name.split('/')[0] ?? 'registry',
      url: s.repository?.url,
      mcp: { remote: remote?.url, needsAuth: Boolean(remote?.headers?.some((h) => h.isRequired)), npm },
    })
  }
  return out
}

/** GitHub repositories about Claude Code plugins, skills and MCP servers matching the query. */
export async function github(q: string, fetchJson: Fetch, token?: string): Promise<Item[]> {
  const query = `${q} claude in:name,description,topics fork:false`
  const j = (await fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=25`, {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  })) as { items?: { full_name: string; description?: string | null; html_url: string; stargazers_count: number; topics?: string[] }[] }
  return (j.items ?? []).map((r) => ({ source: 'github', id: r.full_name, name: r.full_name, description: r.description ?? '', where: (r.topics ?? []).slice(0, 3).join(', ') || 'GitHub', url: r.html_url, stars: r.stargazers_count }))
}

/**
 * Ranks items for a query: every word must appear; a name hit beats a description hit, an exact
 * name wins, and installed ones go first. An empty query keeps the order.
 */
export function rank(items: Item[], q: string): Item[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return items
  const scored: { it: Item; score: number }[] = []
  for (const it of items) {
    const name = it.name.toLowerCase()
    const hay = `${name} ${it.description.toLowerCase()} ${it.where.toLowerCase()} ${it.id.toLowerCase()}`
    if (!words.every((w) => hay.includes(w))) continue
    let score = 0
    for (const w of words) score += name === w ? 100 : name.startsWith(w) ? 40 : name.includes(w) ? 25 : 5
    if (it.installed) score += 3
    if (it.stars) score += Math.min(10, Math.log10(it.stars + 1) * 2)
    scored.push({ it, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.it)
}
