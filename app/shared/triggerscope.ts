// What a trigger's run may touch: folders it may read, folders it may write and commands it may run.
// Set on the trigger; the app refuses anything outside it before the usual approvals, so a run
// nobody watches cannot wander. Empty lists keep the old behavior for that kind.

export type Scope = { read: string[]; write: string[]; commands: string[] }

const READS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead', 'LS'])
const WRITES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

const norm = (p: string) => p.replace(/\/+$/, '') || '/'
/** `p` resolved against `cwd` without touching the disk; `..` cannot climb out unseen. */
export function resolveIn(cwd: string, p: string): string {
  const parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/')
  const out: string[] = []
  for (const x of parts) {
    if (!x || x === '.') continue
    if (x === '..') out.pop()
    else out.push(x)
  }
  return `/${out.join('/')}`
}
const inside = (path: string, dir: string) => path === norm(dir) || path.startsWith(`${norm(dir)}/`)

export const cleanScope = (s: Partial<Scope> | undefined): Scope | undefined => {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 40) : [])
  const c = { read: list(s?.read), write: list(s?.write), commands: list(s?.commands) }
  return c.read.length || c.write.length || c.commands.length ? c : undefined
}

/** Why the trigger's scope refuses this call, or null when it is inside. Folders resolve from `cwd`. */
export function outside(scope: Scope, cwd: string, tool: string, input: Record<string, unknown>): string | null {
  const dirs = (l: string[]) => l.map((d) => resolveIn(cwd, d))
  const target = String(input.file_path ?? input.notebook_path ?? input.path ?? '')
  if (WRITES.has(tool) && scope.write.length) {
    const p = resolveIn(cwd, target || '.')
    if (!dirs(scope.write).some((d) => inside(p, d))) return `writes to ${p}, outside the folders it may write (${scope.write.join(', ')})`
  }
  if (READS.has(tool) && (scope.read.length || scope.write.length)) {
    const p = resolveIn(cwd, target || '.')
    if (![...dirs(scope.read), ...dirs(scope.write)].some((d) => inside(p, d))) return `reads ${p}, outside the folders it may read (${[...scope.read, ...scope.write].join(', ')})`
  }
  if (tool === 'Bash' && scope.commands.length) {
    // every command in a chain must be allowed: `npm test && curl x` is two commands
    const cmds = String(input.command ?? '').split(/&&|\|\||;|\||\n|`|\$\(/).map((c) => c.trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/, '')).filter(Boolean)
    const bad = cmds.find((c) => !scope.commands.some((a) => c === a || c.startsWith(`${a} `)))
    if (bad) return `runs "${bad.slice(0, 80)}", not among the commands it may run (${scope.commands.join(', ')})`
  }
  return null
}
