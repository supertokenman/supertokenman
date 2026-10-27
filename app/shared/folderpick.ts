// The list in the in-app folder picker: recent projects first, then git repositories found on disk,
// filtered by what the person typed.
export interface FolderItem {
  path: string
  name: string
  group: 'Recent' | 'Git repositories'
}

const nameOf = (p: string) => p.split('/').filter(Boolean).at(-1) ?? p

/** Recents (newest first) and found repos, deduplicated, filtered by `query` (name matches before path matches). */
export function folderList(recents: string[], repos: string[], query: string, max = 60): FolderItem[] {
  const seen = new Set<string>()
  const all: FolderItem[] = []
  for (const [list, group] of [[recents, 'Recent'], [repos, 'Git repositories']] as const)
    for (const p of list) {
      const path = p.replace(/\/+$/, '') || '/'
      if (seen.has(path)) continue
      seen.add(path)
      all.push({ path, name: nameOf(path), group })
    }
  const q = query.trim().toLowerCase()
  if (!q) return all.slice(0, max)
  const score = (f: FolderItem) => {
    const n = f.name.toLowerCase()
    if (n === q) return 0
    if (n.startsWith(q)) return 1
    if (n.includes(q)) return 2
    if (f.path.toLowerCase().includes(q)) return 3
    // letters in order, like "stm" for "supertokenman"
    let i = 0
    for (const c of n) if (c === q[i]) i++
    return i === q.length ? 4 : -1
  }
  return all
    .map((f, i) => ({ f, s: score(f), i }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.f)
}

/** Shows a path with the home folder as ~. */
export const tilde = (path: string, home: string) => (home && (path === home || path.startsWith(home + '/')) ? '~' + path.slice(home.length) : path)
