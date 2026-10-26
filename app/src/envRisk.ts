// What the env scan means: the files that put a secret at risk, the values that live in several projects,
// and how old each one is. Pure, from the scan's masked results.
import type { EnvFile } from '../electron/envScan'

export type Risk = { level: 0 | 1 | 2; file: string; project: string; title: string; fix?: 'ignore' }
const SECRET = (k: string) => k !== 'setting' && k !== 'empty'

export function risks(files: EnvFile[], now = Date.now()): Risk[] {
  const out: Risk[] = []
  for (const f of files) {
    const secrets = f.keys.filter((k) => SECRET(k.kind))
    if (f.template) {
      if (secrets.length) out.push({ level: 1, file: f.path, project: f.project, title: `${secrets.length} real-looking value${secrets.length > 1 ? 's' : ''} in a template, which is meant to be committed` })
      continue
    }
    if (!secrets.length) continue
    if (f.git.tracked) out.push({ level: 0, file: f.path, project: f.project, title: `Committed to git with ${secrets.length} secret${secrets.length > 1 ? 's' : ''}: rotate them, then untrack the file` })
    else if (f.git.inHistory) out.push({ level: 0, file: f.path, project: f.project, title: 'Was committed once: the secrets are still in the git history; rotate them' })
    else if (f.git.inRepo && !f.git.ignored) out.push({ level: 1, file: f.path, project: f.project, title: 'Not in .gitignore: one `git add .` away from being committed', fix: 'ignore' })
    if (now - f.mtime > 180 * 86_400_000) out.push({ level: 2, file: f.path, project: f.project, title: `Untouched for ${Math.round((now - f.mtime) / (30 * 86_400_000))} months: revoke the keys if the project is dead` })
  }
  return out.sort((a, b) => a.level - b.level)
}

/** Values that appear in more than one place, by their hash: where each lives. */
export function repeats(files: EnvFile[]): { hash: string; kind: string; masked: string; places: { project: string; name: string; path: string }[] }[] {
  const by = new Map<string, { hash: string; kind: string; masked: string; places: { project: string; name: string; path: string }[] }>()
  for (const f of files)
    for (const k of f.keys) {
      if (!k.hash || !SECRET(k.kind)) continue
      const g = by.get(k.hash) ?? { hash: k.hash, kind: k.kind, masked: k.masked, places: [] }
      g.places.push({ project: f.project, name: k.name, path: f.path })
      by.set(k.hash, g)
    }
  return [...by.values()].filter((g) => new Set(g.places.map((p) => p.path)).size > 1).sort((a, b) => b.places.length - a.places.length)
}
