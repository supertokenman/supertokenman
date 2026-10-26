// Git for a panel's folder: status, per-file diffs, stage and unstage, commit, branches,
// pull and push, and the history with its lanes. Every call is a plain git command.
import { execFile } from 'node:child_process'

export type FileChange = { path: string; staged: string; unstaged: string; untracked: boolean }
export type Status = { branch: string; upstream: string | null; ahead: number; behind: number; files: FileChange[] }
export type Commit = { sha: string; parents: string[]; author: string; when: string; subject: string; refs: string[] }

export type Git = (args: string[]) => Promise<string>

export const gitIn = (cwd: string): Git => (args) =>
  new Promise((resolve, reject) =>
    execFile('git', args, { cwd, timeout: 30_000, maxBuffer: 20 * 1024 * 1024 }, (err, out, errOut) => (err ? reject(new Error(errOut.trim() || err.message)) : resolve(out))),
  )

/** `git status --porcelain=v2 --branch -z`, read. */
export function parseStatus(out: string): Status {
  const s: Status = { branch: '', upstream: null, ahead: 0, behind: 0, files: [] }
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]!
    if (line.startsWith('# branch.head ')) s.branch = line.slice(14)
    else if (line.startsWith('# branch.upstream ')) s.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const [a, b] = line.slice(12).split(' ')
      s.ahead = Number(a)
      s.behind = Math.abs(Number(b))
    } else if (line.startsWith('1 ') || line.startsWith('u ')) {
      const f = line.split(' ')
      s.files.push({ path: f.slice(line.startsWith('u ') ? 10 : 8).join(' '), staged: f[1]![0]!, unstaged: f[1]![1]!, untracked: false })
    } else if (line.startsWith('2 ')) {
      // a rename: the new path here, the old one in the next field
      const f = line.split(' ')
      s.files.push({ path: f.slice(9).join(' '), staged: f[1]![0]!, unstaged: f[1]![1]!, untracked: false })
      i++
    } else if (line.startsWith('? ')) s.files.push({ path: line.slice(2), staged: '.', unstaged: '?', untracked: true })
  }
  return s
}

export const status = async (git: Git) => parseStatus(await git(['status', '--porcelain=v2', '--branch', '-z']))

/** The diff of one file: staged or not; an untracked file shows whole. */
export async function fileDiff(git: Git, path: string, staged: boolean, untracked: boolean): Promise<string> {
  if (untracked) return git(['diff', '--no-index', '--', '/dev/null', path]).catch((e: Error & { message: string }) => e.message)
  return git(['diff', ...(staged ? ['--cached'] : []), '--', path])
}

export const stage = (git: Git, paths: string[]) => git(['add', '--', ...paths])
export const unstage = (git: Git, paths: string[]) => git(['restore', '--staged', '--', ...paths])
export const stagedDiff = (git: Git) => git(['diff', '--cached', '--stat', '--patch'])

export async function commit(git: Git, message: string) {
  if (!message.trim()) throw new Error('Write a commit message.')
  return git(['commit', '-m', message])
}

export async function branches(git: Git): Promise<{ name: string; current: boolean; upstream: string }[]> {
  const out = await git(['branch', '--format=%(HEAD)%00%(refname:short)%00%(upstream:short)'])
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [head, name, up] = l.split('\0')
      return { name: name!, current: head === '*', upstream: up ?? '' }
    })
}

/** Switches branch; refuses names that look like options. */
export async function checkout(git: Git, name: string) {
  if (!/^[\w./-]+$/.test(name) || name.startsWith('-')) throw new Error('Not a branch name.')
  return git(['switch', name])
}

export const pull = (git: Git) => git(['pull', '--ff-only'])
export const push = (git: Git, setUpstream: boolean, branch: string) => git(setUpstream ? ['push', '-u', 'origin', branch] : ['push'])

const SEP = '\x1f'
export async function log(git: Git, n = 80): Promise<Commit[]> {
  const out = await git(['log', '--all', '--date-order', `-n${n}`, `--pretty=format:%H${SEP}%P${SEP}%an${SEP}%ar${SEP}%s${SEP}%D`])
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, parents, author, when, subject, refs] = l.split(SEP)
      return { sha: sha!, parents: parents ? parents.split(' ') : [], author: author!, when: when!, subject: subject!, refs: refs ? refs.split(', ').filter(Boolean) : [] }
    })
}

export type Laid = Commit & { lane: number; lines: { from: number; to: number }[] }

/**
 * Lanes for a history graph: each commit gets a column; `lines` say which columns carry on from this
 * row to the next (from a lane here to a lane below), so the graph is drawn row by row.
 */
export function lanes(commits: Commit[]): Laid[] {
  let active: (string | null)[] = []
  const out: Laid[] = []
  for (const c of commits) {
    let lane = active.indexOf(c.sha)
    if (lane === -1) {
      lane = active.indexOf(null)
      if (lane === -1) lane = active.length
    }
    const next = [...active]
    next[lane] = c.parents[0] ?? null
    // the other parents take a free lane, or join one that already waits for them
    for (const p of c.parents.slice(1)) {
      if (next.includes(p)) continue
      const free = next.indexOf(null)
      if (free === -1) next.push(p)
      else next[free] = p
    }
    // lanes that waited for this commit end here
    active.forEach((sha, i) => {
      if (sha === c.sha && i !== lane) next[i] = null
    })
    const lines: { from: number; to: number }[] = []
    active.forEach((sha, i) => {
      if (sha && sha !== c.sha && next.indexOf(sha) !== -1) lines.push({ from: i, to: next.indexOf(sha) })
    })
    c.parents.forEach((p) => {
      const to = next.indexOf(p)
      if (to !== -1) lines.push({ from: lane, to })
    })
    while (next.length && next[next.length - 1] === null) next.pop()
    out.push({ ...c, lane, lines })
    active = next
  }
  return out
}
