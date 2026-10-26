// A panel in its own git worktree: a separate checkout of the same repository on its own branch, so
// two panels in one project never edit the same files. When the work is done it is committed on that
// branch and merged into the branch the panel started from; or the worktree and branch are dropped.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'

export type Worktree = { repo: string; path: string; branch: string; base: string }

const git = (cwd: string, args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((ok) =>
    execFile('git', ['-C', cwd, ...args], { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 }, (e, out, err) => ok({ ok: !e, out: `${out ?? ''}${e ? (err ?? '') : ''}`.trim() })),
  )

/** The repository a folder belongs to, and the branch it is on; null outside a repository. */
export async function repoOf(cwd: string): Promise<{ root: string; branch: string } | null> {
  const root = await git(cwd, ['rev-parse', '--show-toplevel'])
  if (!root.ok) return null
  const branch = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return { root: root.out, branch: branch.ok ? branch.out : 'HEAD' }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'work'

/** A new worktree on a new branch off where the folder stands now, under the app's own folder. */
export async function createWorktree(cwd: string, home: string, label: string, now = Date.now()): Promise<Worktree> {
  const r = await repoOf(cwd)
  if (!r) throw new Error('This folder is not in a git repository, so it cannot have its own worktree.')
  const id = `${slug(label)}-${now.toString(36).slice(-5)}`
  const branch = `stm/${id}`
  const dir = join(home, `${basename(r.root)}-${id}`)
  mkdirSync(home, { recursive: true })
  const add = await git(r.root, ['worktree', 'add', '-b', branch, dir, 'HEAD'])
  if (!add.ok) throw new Error(`git could not make the worktree: ${add.out.split('\n').pop()}`)
  return { repo: r.root, path: dir, branch, base: r.branch }
}

/** What the worktree changed against its base: files and line counts, committed or not. */
export async function worktreeStat(w: Worktree): Promise<{ files: number; added: number; removed: number; list: { path: string; added: number; removed: number }[] }> {
  // count what is not committed yet as well: a throwaway index sees the working tree
  await git(w.path, ['add', '-A', '--intent-to-add'])
  const d = await git(w.path, ['diff', '--numstat', w.base])
  const list = d.out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [a, r, p] = l.split('\t')
      return { path: p ?? '', added: Number(a) || 0, removed: Number(r) || 0 }
    })
  return { files: list.length, added: list.reduce((n, x) => n + x.added, 0), removed: list.reduce((n, x) => n + x.removed, 0), list }
}

/**
 * The worktree's work, committed on its branch and merged into the base branch of the main checkout.
 * Refuses when the main checkout has uncommitted changes or is on another branch; a conflict is
 * aborted, leaving both sides as they were.
 */
export async function mergeWorktree(w: Worktree, message: string): Promise<{ merged: boolean; why?: string }> {
  await git(w.path, ['add', '-A'])
  const staged = await git(w.path, ['diff', '--cached', '--quiet'])
  if (!staged.ok) {
    const c = await git(w.path, ['-c', 'user.name=SuperTokenMan', '-c', 'user.email=stm@localhost', 'commit', '-m', message.slice(0, 200) || 'Work from a panel'])
    if (!c.ok) return { merged: false, why: `Could not commit in the worktree: ${c.out.split('\n').pop()}` }
  }
  const ahead = await git(w.repo, ['rev-list', '--count', `${w.base}..${w.branch}`])
  if (ahead.ok && ahead.out === '0') return { merged: false, why: 'Nothing to merge: the worktree has no changes.' }
  const on = await git(w.repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (on.out !== w.base) return { merged: false, why: `The main checkout is on ${on.out}, not ${w.base}. Switch it back, then merge.` }
  const dirty = await git(w.repo, ['status', '--porcelain', '--untracked-files=no'])
  if (dirty.out) return { merged: false, why: 'The main checkout has uncommitted changes. Commit or stash them, then merge.' }
  // the merge commit is yours when git knows who you are; otherwise it is signed like the worktree's commit
  const who = await git(w.repo, ['config', 'user.email'])
  const id = who.ok && who.out ? [] : ['-c', 'user.name=SuperTokenMan', '-c', 'user.email=stm@localhost']
  const m = await git(w.repo, [...id, 'merge', '--no-ff', '--no-edit', w.branch])
  if (!m.ok) {
    const conflicts = await git(w.repo, ['diff', '--name-only', '--diff-filter=U'])
    await git(w.repo, ['merge', '--abort'])
    if (conflicts.out) return { merged: false, why: `The merge has conflicts in ${conflicts.out.split('\n').slice(0, 3).join(', ')}, so it was undone. Resolve them in the worktree's panel, then merge again.` }
    return { merged: false, why: `git merge failed: ${m.out.split('\n').filter(Boolean).pop() ?? 'no reason given'}` }
  }
  return { merged: true }
}

/** The worktree and its branch gone; the main checkout untouched. */
export async function dropWorktree(w: Worktree): Promise<boolean> {
  const rm = await git(w.repo, ['worktree', 'remove', '--force', w.path])
  await git(w.repo, ['branch', '-D', w.branch])
  return rm.ok || !existsSync(w.path)
}
