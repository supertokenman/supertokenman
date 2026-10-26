import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorktree, dropWorktree, mergeWorktree, repoOf, worktreeStat } from './worktree'

const g = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'repo-'))
  g(d, 'init', '-q', '-b', 'main')
  g(d, 'config', 'user.email', 't@t')
  g(d, 'config', 'user.name', 't')
  writeFileSync(join(d, 'a.txt'), 'one\n')
  g(d, 'add', '.')
  g(d, 'commit', '-qm', 'init')
  return d
}

describe('worktree', () => {
  it('makes a worktree on its own branch, outside the repository', async () => {
    const r = repo()
    const home = mkdtempSync(join(tmpdir(), 'wt-'))
    const w = await createWorktree(r, home, 'Fix login!', 1_700_000_000_000)
    // git names the top level by its resolved path (/private/var for /var on macOS)
    expect(w).toMatchObject({ repo: realpathSync(r), base: 'main' })
    expect(w.branch).toMatch(/^stm\/fix-login-/)
    expect(w.path.startsWith(home)).toBe(true)
    expect(readFileSync(join(w.path, 'a.txt'), 'utf8')).toBe('one\n')
    expect(await repoOf(join(tmpdir()))).toBeNull()
  })
  it('counts changes, merges them into the base branch, and drops the worktree', async () => {
    const r = repo()
    const w = await createWorktree(r, mkdtempSync(join(tmpdir(), 'wt-')), 'feature')
    writeFileSync(join(w.path, 'a.txt'), 'one\ntwo\n')
    writeFileSync(join(w.path, 'b.txt'), 'new\n')
    expect(await worktreeStat(w)).toMatchObject({ files: 2, added: 2, removed: 0 })
    // the main checkout is untouched until the merge
    expect(readFileSync(join(r, 'a.txt'), 'utf8')).toBe('one\n')
    expect(await mergeWorktree(w, 'Add two and b')).toEqual({ merged: true })
    expect(readFileSync(join(r, 'a.txt'), 'utf8')).toBe('one\ntwo\n')
    expect(existsSync(join(r, 'b.txt'))).toBe(true)
    expect(await dropWorktree(w)).toBe(true)
    expect(existsSync(w.path)).toBe(false)
    expect(g(r, 'branch', '--list', w.branch)).toBe('')
  })
  it('refuses to merge into a checkout with uncommitted changes, and undoes a conflict', async () => {
    const r = repo()
    const w = await createWorktree(r, mkdtempSync(join(tmpdir(), 'wt-')), 'x')
    writeFileSync(join(w.path, 'a.txt'), 'theirs\n')
    writeFileSync(join(r, 'a.txt'), 'dirty\n')
    expect((await mergeWorktree(w, 'm')).why).toMatch(/uncommitted changes/)
    writeFileSync(join(r, 'a.txt'), 'ours\n')
    g(r, 'commit', '-qam', 'ours')
    const m = await mergeWorktree(w, 'm')
    expect(m.merged).toBe(false)
    expect(m.why).toMatch(/conflicts in a.txt, so it was undone/)
    expect(readFileSync(join(r, 'a.txt'), 'utf8')).toBe('ours\n')
    expect(g(r, 'status', '--porcelain')).toBe('')
  })
  it('says so when there is nothing to merge', async () => {
    const r = repo()
    const w = await createWorktree(r, mkdtempSync(join(tmpdir(), 'wt-')), 'idle')
    expect(await mergeWorktree(w, 'm')).toEqual({ merged: false, why: 'Nothing to merge: the worktree has no changes.' })
  })
})
