// Memory across chats, from two places: the token-kit vault (Markdown notes: rules, one note per
// project, one per session, written by its Stop hook) and Claude Code's own session list, which
// the SDK can resume exactly where a conversation stopped.
import { stripPrivate } from '../shared/private.js'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'

export type Hit = { file: string; line: number; text: string }
export type Note = { file: string; title: string; date: string; excerpt: string }

/** The vault folder token-kit is configured with, or ''. */
export function vaultDir(home = homedir()): string {
  try {
    const cfg = JSON.parse(readFileSync(join(process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'token-kit', 'config.json'), 'utf8')) as { vault?: { path?: string } }
    const p = cfg.vault?.path ?? ''
    if (p) return p.startsWith('~') ? join(home, p.slice(1)) : p
  } catch {
    // no token-kit vault: the app's own folder below
  }
  // without a vault set up, memory still works: plain markdown in a folder the person can open (Obsidian too)
  return process.env.STM_MEMORY_DIR || join(home, 'Documents', 'SuperTokenMan', 'memory')
}

/** The project's name as token-kit names it: the folder's name, safe for a file name. */
export const projectName = (cwd: string) => basename(cwd).replace(/[^A-Za-z0-9._-]+/g, '-') || 'misc'

function markdown(dir: string): string[] {
  const out: string[] = []
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const n of names) {
    if (n.startsWith('.') || n === 'node_modules') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...markdown(p))
    else if (n.endsWith('.md')) out.push(p)
  }
  return out
}

/**
 * Lines that hold every word of `q`: rules first, then project notes, then sessions, newest
 * first; sessions of other projects are left out when `project` is given.
 */
export function search(vault: string, q: string, project?: string, max = 40): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!vault || !words.length) return []
  const tier = (rel: string) => (rel.startsWith('rules') ? 0 : rel.startsWith('projects') ? 1 : 2)
  const files = markdown(vault)
    .map((f) => ({ f, rel: relative(vault, f), mtime: statSync(f).mtimeMs }))
    .filter(({ rel }) => !project || !rel.startsWith('sessions') || rel.startsWith(join('sessions', project)))
    .sort((a, b) => tier(a.rel) - tier(b.rel) || b.mtime - a.mtime)
  const out: Hit[] = []
  for (const { f, rel } of files) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((l, i) => {
      if (out.length < max && words.every((w) => l.toLowerCase().includes(w))) out.push({ file: rel, line: i + 1, text: l.trim().slice(0, 240) })
    })
    if (out.length >= max) break
  }
  return out
}

/** The project's session notes, newest first: title, date and the start of the last answer. */
export function sessionNotes(vault: string, project: string, max = 20): Note[] {
  const dir = join(vault, 'sessions', project)
  if (!vault || !existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((n) => {
      const text = readFileSync(join(dir, n), 'utf8')
      const title = text.match(/^# (.+)$/m)?.[1] ?? n
      const date = text.match(/^date: (\S+)/m)?.[1] ?? ''
      const excerpt = text.match(/## Last answer \(excerpt\)\n\n> (.+)/)?.[1]?.slice(0, 220) ?? ''
      return { file: join('sessions', project, n), title, date, excerpt }
    })
    .sort((a, b) => b.file.localeCompare(a.file))
    .slice(0, max)
}

/** A note's text, for a file inside the vault only. */
export function readNote(vault: string, file: string): string {
  const p = join(vault, file)
  if (!vault || relative(vault, p).startsWith('..')) throw new Error('Outside the vault.')
  return readFileSync(p, 'utf8')
}

/** Appends a dated entry to the project's note (medium-term memory), creating the note if needed. */
export function remember(vault: string, project: string, title: string, text: string, now = new Date()) {
  // what the person marked <private> is never kept
  title = stripPrivate(title)
  text = stripPrivate(text)
  if (!vault) throw new Error('No memory vault yet. Run `tk vault init <folder>` from token-kit first.')
  const file = join(vault, 'projects', `${project}.md`)
  mkdirSync(join(vault, 'projects'), { recursive: true })
  if (!existsSync(file)) writeFileSync(file, `# ${project}\n\nState, decisions and next steps. Entries below were saved from the app.\n`)
  const entry = `\n## ${now.toISOString().slice(0, 10)} ${title.replace(/\s+/g, ' ').trim().slice(0, 80)}\n\n${text.trim()}\n`
  // a stop noted again with nothing new is not written twice
  if (!readFileSync(file, 'utf8').endsWith(entry)) appendFileSync(file, entry)
  return relative(vault, file)
}

export type GraphNode = { id: string; kind: 'rule' | 'project' | 'session'; title: string; project: string; date: string; usd: number; files: string[] }
export type GraphEdge = { a: string; b: string; why: 'link' | 'files' | 'project'; weight: number }

/** Files listed under a session note's "Files changed". */
const filesOf = (text: string) =>
  [...(text.split('## Files changed')[1]?.split('\n## ')[0] ?? '').matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]!)

/**
 * The vault as a graph: one node per note; edges for [[wiki links]], for sessions that changed the
 * same files (weighted by how many), and from each session to its project's note.
 */
export function graph(vault: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (!vault) return { nodes: [], edges: [] }
  const nodes: GraphNode[] = []
  const texts = new Map<string, string>()
  for (const f of markdown(vault)) {
    const rel = relative(vault, f)
    const parts = rel.split(/[\\/]/)
    if (parts[0] === 'README.md' || parts.at(-1) === 'README.md' || parts.at(-1) === '_template.md') continue
    const text = readFileSync(f, 'utf8')
    texts.set(rel, text)
    const kind = parts[0] === 'rules' ? 'rule' : parts[0] === 'projects' ? 'project' : parts[0] === 'sessions' ? 'session' : null
    if (!kind) continue
    nodes.push({
      id: rel,
      kind,
      title: text.match(/^# (.+)$/m)?.[1]?.trim() ?? basename(rel, '.md'),
      project: kind === 'project' ? basename(rel, '.md') : kind === 'session' ? (parts[1] ?? '') : '',
      date: text.match(/^date: (\S+)/m)?.[1] ?? '',
      usd: Number(text.match(/^api_value_usd: ([\d.]+)/m)?.[1] ?? 0),
      files: kind === 'session' ? filesOf(text) : [],
    })
  }
  const edges: GraphEdge[] = []
  const byName = new Map(nodes.map((n) => [basename(n.id, '.md').toLowerCase(), n.id]))
  for (const n of nodes) {
    for (const m of (texts.get(n.id) ?? '').matchAll(/\[\[([^\]|#]+)/g)) {
      const target = byName.get(basename(m[1]!.trim(), '.md').toLowerCase())
      if (target && target !== n.id) edges.push({ a: n.id, b: target, why: 'link', weight: 1 })
    }
    if (n.kind === 'session') {
      const proj = nodes.find((p) => p.kind === 'project' && p.project === n.project)
      if (proj) edges.push({ a: n.id, b: proj.id, why: 'project', weight: 1 })
    }
  }
  const sessions = nodes.filter((n) => n.kind === 'session')
  for (let i = 0; i < sessions.length; i++)
    for (let j = i + 1; j < sessions.length; j++) {
      const shared = sessions[i]!.files.filter((f) => sessions[j]!.files.includes(f)).length
      if (shared) edges.push({ a: sessions[i]!.id, b: sessions[j]!.id, why: 'files', weight: shared })
    }
  return { nodes, edges }
}

let cached: { vault: string; sig: string; value: ReturnType<typeof graph> } | null = null

/** The graph, rebuilt only when a note was added, removed or changed since the last call. */
export function graphCached(vault: string) {
  const sig = markdown(vault)
    .map((f) => `${f}:${statSync(f).mtimeMs}`)
    .join('|')
  if (cached && cached.vault === vault && cached.sig === sig) return cached.value
  cached = { vault, sig, value: graph(vault) }
  return cached.value
}

/**
 * The tail of the project's note, cut at an entry heading, to hand a new session what earlier ones
 * saved; '' when there is none.
 */
export function projectMemory(vault: string, project: string, max = 4000): string {
  if (!vault) return ''
  let text = ''
  try {
    text = readFileSync(join(vault, 'projects', `${project}.md`), 'utf8').trim()
  } catch {
    return ''
  }
  if (text.length <= max) return text
  const tail = text.slice(-max)
  const at = tail.indexOf('\n## ')
  return at >= 0 ? tail.slice(at + 1) : tail
}

type Line = { type?: string; isMeta?: boolean; isCompactSummary?: boolean; message?: { content?: unknown } }
type Block = { type?: string; text?: string; name?: string; input?: { file_path?: string } }

const short = (t: string, n: number) => (t = t.replace(/\s+/g, ' ').trim()).length > n ? `${t.slice(0, n - 1)}…` : t

/**
 * What a conversation was about, from its transcript (JSON lines) and without a model call: the
 * last requests, the files edited and the last answer. '' when there is nothing to keep.
 */
export function digest(jsonl: string, maxAsks = 8): string {
  const asks: string[] = []
  const files = new Set<string>()
  let last = ''
  for (const raw of jsonl.split('\n')) {
    let l: Line
    try {
      l = JSON.parse(raw) as Line
    } catch {
      continue
    }
    if (l.isMeta || l.isCompactSummary) continue
    const c = l.message?.content
    if (l.type === 'user') {
      const text = typeof c === 'string' ? c : Array.isArray(c) ? (c as Block[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ') : ''
      // the person's own words: not the app's notes around them, nor Claude Code's interruption marker
      const ask = stripPrivate(text.replace(/^\[Message from the "[^"]*" panel[^\]]*\]\s*/, '').replace(/\s*\[Also in this project's memory[^\]]*\]\s*$/, ''))
      if (/^\[Request interrupted/.test(ask.trim())) continue
      if (ask.trim() && !ask.startsWith('<') && !ask.startsWith('This session is being continued')) asks.push(short(ask, 160))
    } else if (l.type === 'assistant' && Array.isArray(c)) {
      const text = (c as Block[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
      if (text) last = stripPrivate(text)
      for (const b of c as Block[]) if (b.type === 'tool_use' && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name ?? '') && b.input?.file_path) files.add(b.input.file_path)
    }
  }
  if (!asks.length && !last) return ''
  const out: string[] = []
  if (asks.length) out.push('Asked:', ...asks.slice(-maxAsks).map((a) => `- ${a}`))
  if (files.size) out.push('', 'Files edited:', ...[...files].slice(-12).map((f) => `- ${f}`))
  if (last) out.push('', 'Where it stopped:', last.length > 1200 ? `${last.slice(0, 1199)}…` : last)
  return out.join('\n')
}

/** Asks Claude to mark decisions in one line the app can save, instead of a second model call. */
export const DECISION_RULE =
  'When this reply settles a decision about the project (a choice between options, a convention, a constraint), end it with one line per decision: `Decision: <what was decided> because <why>`. Only for real decisions, not for each step.'

export type Decision = { what: string; why: string }

/** The `Decision:` lines of a reply. */
export function decisions(reply: string): Decision[] {
  const out: Decision[] = []
  for (const raw of reply.split('\n')) {
    const m = /^\s*[-*>]?\s*\**decision\**:\**\s*(.+)$/i.exec(raw)
    if (!m) continue
    const text = m[1]!.replace(/[`*]/g, '').trim()
    const at = text.search(/\s+because\s+/i)
    const what = (at >= 0 ? text.slice(0, at) : text).trim().replace(/[.;]$/, '')
    const why = at >= 0 ? text.slice(at).replace(/^\s+because\s+/i, '').trim() : ''
    if (what) out.push({ what, why })
  }
  return out
}

/** Saves decisions to the project's note, once each; returns how many were new. */
export function rememberDecisions(vault: string, project: string, list: Decision[], now = new Date()): number {
  if (!vault || !list.length) return 0
  let note = ''
  try {
    note = readFileSync(join(vault, 'projects', `${project}.md`), 'utf8')
  } catch {
    // a new note
  }
  let n = 0
  for (const d of list) {
    if (note.includes(`Decision: ${d.what}`)) continue
    remember(vault, project, `Decision: ${d.what}`, d.why ? `Why: ${d.why}` : 'Why: not stated.', now)
    note += `Decision: ${d.what}`
    n++
  }
  return n
}

export type DocKind = 'note' | 'claude'

/** Where the editable memory lives: the project's note in the vault, or the folder's CLAUDE.md. */
export function docPath(kind: DocKind, cwd: string, vault: string): string {
  if (kind === 'claude') return join(cwd, 'CLAUDE.md')
  if (!vault) throw new Error('No memory vault yet. Run `tk vault init <folder>` from token-kit first.')
  return join(vault, 'projects', `${projectName(cwd)}.md`)
}

export function readDoc(kind: DocKind, cwd: string, vault: string): { path: string; text: string; exists: boolean } {
  const path = docPath(kind, cwd, vault)
  try {
    return { path, text: readFileSync(path, 'utf8'), exists: true }
  } catch {
    return { path, text: '', exists: false }
  }
}

export function writeDoc(kind: DocKind, cwd: string, vault: string, text: string): string {
  const path = docPath(kind, cwd, vault)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`)
  return path
}
