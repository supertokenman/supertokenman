// Git repositories under the home folder, for the in-app folder picker. Local disk only, no network.
// Depth-limited and skips heavy or private folders, so it answers in well under a second.
import { readdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'

export interface FoundRepo {
  path: string
  name: string
  /** last change of the .git folder, ms; a rough "worked on lately" */
  at: number
}

const SKIP = new Set(['node_modules', 'Library', '.Trash', 'Applications', 'Pictures', 'Music', 'Movies', '.cache', '.npm', '.cargo', '.rustup', 'vendor', 'Pods', 'DerivedData', 'build', 'dist', '.venv', 'venv', 'target'])

export const repoRoots = (home: string) => [home, ...['dev', 'code', 'projects', 'Developer', 'src', 'repos', 'work', 'Documents', 'Desktop'].map((d) => join(home, d))]

/** Walks each root up to `depth` folders down and returns the folders that hold a .git. */
export async function findRepos(roots: string[], opts: { depth?: number; limit?: number } = {}): Promise<FoundRepo[]> {
  const depth = opts.depth ?? 3
  const limit = opts.limit ?? 400
  const seen = new Set<string>()
  const out: FoundRepo[] = []
  const walk = async (dir: string, left: number): Promise<void> => {
    if (out.length >= limit || seen.has(dir)) return
    seen.add(dir)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const git = entries.find((e) => e.name === '.git')
    if (git) {
      const at = await stat(join(dir, '.git')).then((s) => s.mtimeMs, () => 0)
      out.push({ path: dir, name: basename(dir), at })
      return // a repo's own subfolders are not separate projects
    }
    if (left <= 0) return
    await Promise.all(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name)).map((e) => walk(join(dir, e.name), left - 1)))
  }
  for (const r of roots) await walk(r, depth)
  return out.sort((a, b) => b.at - a.at).slice(0, limit)
}
