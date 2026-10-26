// Phase 119: the project's quick check after Claude edits (idea from oh-my-opencode, no code from it).
// The app finds the check (a typecheck or lint the project already has), takes the errors before the
// turn's first edit and after the turn, and gives Claude only the new ones before it says it is done.

export type Check = { label: string; cmd: string; args: string[] }
export type Diag = { file: string; line: number; code: string; message: string }

type Pkg = { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> }

/**
 * The check for a folder, from what is in it: a typecheck script, else tsc over tsconfig.json, else a lint
 * script; for Python, ruff or mypy when pyproject.toml names them. `has` says whether a file exists.
 */
export function detect(pkg: Pkg | null, has: (file: string) => boolean, pyproject: string | null): Check | null {
  const s = pkg?.scripts ?? {}
  const pick = ['typecheck', 'type-check', 'check-types', 'tsc'].find((k) => s[k])
  if (pick) return { label: `npm run ${pick}`, cmd: 'npm', args: ['run', '-s', pick] }
  if (has('tsconfig.json')) return { label: 'tsc --noEmit', cmd: 'npx', args: ['--no-install', 'tsc', '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'] }
  if (s.lint) return { label: 'npm run lint', cmd: 'npm', args: ['run', '-s', 'lint'] }
  if (pyproject && /\[tool\.ruff/.test(pyproject)) return { label: 'ruff check', cmd: 'ruff', args: ['check', '--output-format', 'concise'] }
  if (pyproject && /\[tool\.mypy/.test(pyproject)) return { label: 'mypy', cmd: 'mypy', args: ['--no-error-summary', '--hide-error-context', '.'] }
  return null
}

const TSC = /^(.+?)\((\d+),\d+\):\s+error\s+(TS\d+):\s+(.*)$/
const TSC_PRETTY = /^(.+?):(\d+):\d+\s+-\s+error\s+(TS\d+):\s+(.*)$/
const RUFF = /^(.+?):(\d+):\d+:\s+([A-Z]+\d+)\s+(.*)$/
const MYPY = /^(.+?):(\d+):\s+error:\s+(.*?)(?:\s+\[([\w-]+)\])?$/
const ESLINT = /^(.+?):\s*line\s+(\d+),\s*col\s+\d+,\s*Error\s+-\s+(.*?)(?:\s+\(([\w@/-]+)\))?$/

/** Error lines from the usual formats; warnings and anything else are ignored. */
export function parse(out: string): Diag[] {
  const ds: Diag[] = []
  for (const raw of out.split('\n')) {
    const l = raw.replace(/\x1b\[[0-9;]*m/g, '').trim()
    let m = TSC.exec(l) ?? TSC_PRETTY.exec(l)
    if (m) {
      ds.push({ file: m[1]!, line: Number(m[2]), code: m[3]!, message: m[4]! })
      continue
    }
    if ((m = RUFF.exec(l))) {
      ds.push({ file: m[1]!, line: Number(m[2]), code: m[3]!, message: m[4]! })
      continue
    }
    if ((m = MYPY.exec(l))) {
      ds.push({ file: m[1]!, line: Number(m[2]), code: m[4] ?? 'mypy', message: m[3]! })
      continue
    }
    if ((m = ESLINT.exec(l))) ds.push({ file: m[1]!, line: Number(m[2]), code: m[4] ?? 'eslint', message: m[3]! })
  }
  return ds
}

// lines move when code is added above, so an error is known by file, code and message
const key = (d: Diag) => `${d.file.replace(/^\.\//, '')}\u0000${d.code}\u0000${d.message}`

/** The errors in `after` that were not in `before`, counted, so one more of the same also shows. */
export function fresh(before: Diag[], after: Diag[]): Diag[] {
  const left = new Map<string, number>()
  for (const d of before) left.set(key(d), (left.get(key(d)) ?? 0) + 1)
  return after.filter((d) => {
    const n = left.get(key(d)) ?? 0
    if (n > 0) return left.set(key(d), n - 1), false
    return true
  })
}

const rel = (file: string, cwd: string) => (file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file.replace(/^\.\//, ''))

/** What Claude reads at the end of the turn: the new errors, the ones in files it touched first. */
export function message(check: Check, found: Diag[], touched: string[], cwd: string, limit = 20): string {
  const mine = new Set(touched.map((t) => rel(t, cwd)))
  const sorted = [...found].sort((a, b) => Number(mine.has(rel(b.file, cwd))) - Number(mine.has(rel(a.file, cwd))))
  const lines = sorted.slice(0, limit).map((d) => `- ${rel(d.file, cwd)}:${d.line} ${d.code} ${d.message}`)
  return `The project check (${check.label}) found ${found.length} new error${found.length === 1 ? '' : 's'} after your edits this turn (errors that were there before are left out):\n${lines.join('\n')}${found.length > limit ? `\n- and ${found.length - limit} more` : ''}\nFix them before you finish, or say plainly why they should stay.`
}

export const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']
/** The file an editing tool call touched, if it is one. */
export const touchedBy = (tool: string, input: Record<string, unknown>) => (EDIT_TOOLS.includes(tool) ? String(input.file_path ?? input.notebook_path ?? '') || null : null)
