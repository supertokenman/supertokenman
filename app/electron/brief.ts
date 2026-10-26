// The project brief: what a new panel needs to know about a project without reading it, in about a
// thousand tokens of plain markdown. Two parts. The map is made from the files, with no model: what the
// project is, its folders, commands, key files and recent commits. Where we stopped is written when a
// conversation ends: what was being done, what is open, what comes next. Decisions come from the note.
// It is a file in the memory folder, readable and editable like any note.
import { stripPrivate } from '../shared/private.js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.turbo', '.cache', 'release', 'dist-electron', '.idea', '.vscode'])
const KEY_FILES = ['README.md', 'CLAUDE.md', 'AGENTS.md', 'Dockerfile', 'docker-compose.yml', 'compose.yaml', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile', 'wrangler.toml', 'vercel.json', 'netlify.toml', 'tsconfig.json', 'vite.config.ts', 'next.config.js', 'next.config.ts', '.env.example', 'Makefile']

const read = (f: string, max = 200_000) => {
  try {
    return readFileSync(f, 'utf8').slice(0, max)
  } catch {
    return ''
  }
}
const git = (cwd: string, args: string[]) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** Files under a folder by extension, walking at most a few thousand entries. */
function census(dir: string, budget = { n: 4000 }) {
  const ext = new Map<string, number>()
  let files = 0
  const walk = (d: string, depth: number) => {
    if (depth > 6 || budget.n <= 0) return
    let list: string[] = []
    try {
      list = readdirSync(d)
    } catch {
      return
    }
    for (const name of list) {
      if (budget.n-- <= 0) return
      if (SKIP.has(name) || name.startsWith('.')) continue
      const p = join(d, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(p, depth + 1)
      else {
        files++
        const e = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
        if (e && e.length <= 5) ext.set(e, (ext.get(e) ?? 0) + 1)
      }
    }
  }
  walk(dir, 0)
  return { files, ext: [...ext].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e]) => e) }
}

/** The map of a project, made from its files. */
export function projectMap(cwd: string): string {
  const out: string[] = []
  const pkg = (() => {
    try {
      return JSON.parse(read(join(cwd, 'package.json'))) as { name?: string; description?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    } catch {
      return null
    }
  })()
  const readme = read(join(cwd, 'README.md'), 6000)
  const intro = readme.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!') && !l.startsWith('[!') && !l.startsWith('<') && !l.startsWith('[!['))[0] ?? ''
  out.push(`**${pkg?.name ?? basename(cwd)}**${pkg?.description ? `: ${pkg.description}` : intro ? `: ${intro.slice(0, 240)}` : ''}`)
  const deps = Object.keys({ ...(pkg?.dependencies ?? {}) }).slice(0, 14)
  if (deps.length) out.push(`Stack: ${deps.join(', ')}`)
  const scripts = Object.entries(pkg?.scripts ?? {}).slice(0, 12)
  if (scripts.length) out.push(`Commands: ${scripts.map(([k]) => `\`npm run ${k}\``).join(', ')}`)
  const make = read(join(cwd, 'Makefile'), 4000).match(/^[a-z][\w-]*(?=:)/gm)
  if (make?.length) out.push(`Make targets: ${[...new Set(make)].slice(0, 10).join(', ')}`)
  // the top folders and what is in them
  let entries: string[] = []
  try {
    entries = readdirSync(cwd)
  } catch {
    entries = []
  }
  const dirs = entries.filter((n) => !SKIP.has(n) && !n.startsWith('.')).filter((n) => {
    try {
      return statSync(join(cwd, n)).isDirectory()
    } catch {
      return false
    }
  })
  if (dirs.length) {
    out.push('Folders:')
    for (const d of dirs.slice(0, 16)) {
      const c = census(join(cwd, d))
      if (c.files) out.push(`- \`${d}/\`: ${c.files} files${c.ext.length ? ` (${c.ext.join(', ')})` : ''}`)
    }
  }
  const keys = KEY_FILES.filter((f) => existsSync(join(cwd, f)))
  const workflows = (() => {
    try {
      return readdirSync(join(cwd, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f))
    } catch {
      return []
    }
  })()
  if (keys.length || workflows.length) out.push(`Key files: ${[...keys, ...workflows.map((w) => `.github/workflows/${w}`)].map((f) => `\`${f}\``).join(', ')}`)
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const log = git(cwd, ['log', '--format=%s', '-6'])
  if (branch) out.push(`Branch: \`${branch}\``)
  if (log) out.push(`Recent commits:\n${log.split('\n').map((l) => `- ${l.slice(0, 110)}`).join('\n')}`)
  return out.join('\n')
}

export const briefFile = (vault: string, project: string) => join(vault, 'projects', `${project}.brief.md`)

type Parts = { map: string; stopped: string; at: string; head: string }
const SECTIONS = { map: '## Map', stopped: '## Where we stopped' }

export function parseBrief(text: string): Partial<Parts> {
  const head = /<!-- head: ([^ ]*) at: ([^ ]*) -->/.exec(text)
  const part = (h: string) => {
    const i = text.indexOf(h)
    if (i < 0) return undefined
    const rest = text.slice(i + h.length)
    const j = rest.search(/\n## /)
    return (j < 0 ? rest : rest.slice(0, j)).trim()
  }
  return { map: part(SECTIONS.map), stopped: part(SECTIONS.stopped), head: head?.[1], at: head?.[2] }
}

function writeBrief(vault: string, project: string, p: Parts) {
  mkdirSync(join(vault, 'projects'), { recursive: true })
  writeFileSync(
    briefFile(vault, project),
    `# ${project}: brief\n\n<!-- head: ${p.head} at: ${p.at} -->\nWhat a new session needs to know without reading the project. The map is rebuilt from the files; edit Where we stopped freely.\n\n${SECTIONS.map}\n\n${p.map}\n\n${SECTIONS.stopped}\n\n${p.stopped || 'Nothing yet: this is filled in when a conversation ends.'}\n`,
  )
}

/** The project's decisions from its note, newest last. */
export function decisionsOf(vault: string, project: string, max = 10) {
  const note = read(join(vault, 'projects', `${project}.md`))
  // saved by rememberDecisions as a heading and a Why line
  return [...note.matchAll(/^## \d{4}-\d\d-\d\d Decision: (.+)\n\n(?:Why: (.+))?/gm)].map((m) => (m[2] && m[2] !== 'not stated.' ? `${m[1]!.trim()} (${m[2].trim()})` : m[1]!.trim())).slice(-max)
}

/**
 * The brief for a new panel: the map refreshed when the code moved on (another commit, or a day passed),
 * where we stopped, and the latest decisions. '' when there is no memory folder.
 */
export function briefFor(vault: string, project: string, cwd: string, now = new Date()): string {
  if (!vault) return ''
  const old = parseBrief(read(briefFile(vault, project)))
  const head = git(cwd, ['rev-parse', 'HEAD']) || 'none'
  const stale = !old.map || old.head !== head || !old.at || now.getTime() - Date.parse(old.at) > 864e5
  const parts: Parts = { map: stale ? projectMap(cwd) : old.map!, stopped: old.stopped ?? '', at: stale ? now.toISOString() : old.at!, head }
  if (stale) {
    try {
      writeBrief(vault, project, parts)
    } catch {
      // a read-only memory folder: the brief is still given, just not kept
    }
  }
  const decisions = decisionsOf(vault, project)
  return [`## Map\n\n${parts.map}`, parts.stopped && !parts.stopped.startsWith('Nothing yet') ? `## Where we stopped\n\n${parts.stopped}` : '', decisions.length ? `## Decisions\n\n${decisions.map((d) => `- ${d}`).join('\n')}` : ''].filter(Boolean).join('\n\n').slice(0, 7000)
}

/** Where we stopped, kept in the brief (the map stays as it is until the code moves on). */
export function saveStopped(vault: string, project: string, cwd: string, stopped: string, now = new Date()) {
  if (!vault || !stopped.trim()) return
  const old = parseBrief(read(briefFile(vault, project)))
  writeBrief(vault, project, { map: old.map ?? projectMap(cwd), stopped: stripPrivate(stopped).trim().slice(0, 3000), at: old.at ?? now.toISOString(), head: old.head ?? (git(cwd, ['rev-parse', 'HEAD']) || 'none') })
}

/** Where Claude Code keeps a conversation's transcript. */
export function transcriptOf(cwd: string, sessionId: string, home = homedir()): string | null {
  if (!/^[\w-]{8,}$/.test(sessionId)) return null
  const root = join(process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'projects')
  const direct = join(root, cwd.replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`)
  if (existsSync(direct)) return direct
  try {
    for (const d of readdirSync(root)) if (existsSync(join(root, d, `${sessionId}.jsonl`))) return join(root, d, `${sessionId}.jsonl`)
  } catch {
    // no transcripts folder
  }
  return null
}

export const STOPPED_PROMPT = 'Below is a digest of a coding session: what was asked, the files changed and the last answer. Write "where we stopped" for whoever picks this project up next, in at most 8 short bullets: what was being done, what is finished, what is open or broken, and the next step. Keep file paths, names and commands exactly. Answer with the bullets only.'
