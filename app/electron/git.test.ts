import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { branches, checkout, commit, fileDiff, gitIn, lanes, log, parseStatus, stage, status, unstage } from './git'

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'stm-git-'))
  const g = (...a: string[]) => execFileSync('git', a, { cwd: dir })
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 't@t')
  g('config', 'user.name', 'T')
  writeFileSync(join(dir, 'a.ts'), 'one\n')
  g('add', '.')
  g('commit', '-qm', 'first')
  return { dir, git: gitIn(dir) }
}

describe('git', () => {
  it('reads status: staged, unstaged, untracked', async () => {
    const { dir, git } = repo()
    writeFileSync(join(dir, 'a.ts'), 'one\ntwo\n')
    writeFileSync(join(dir, 'b.ts'), 'new\n')
    let s = await status(git)
    expect(s.branch).toBe('main')
    expect(s.files).toEqual([
      { path: 'a.ts', staged: '.', unstaged: 'M', untracked: false },
      { path: 'b.ts', staged: '.', unstaged: '?', untracked: true },
    ])
    await stage(git, ['a.ts', 'b.ts'])
    s = await status(git)
    expect(s.files.map((f) => [f.path, f.staged, f.unstaged])).toEqual([['a.ts', 'M', '.'], ['b.ts', 'A', '.']])
    expect(await fileDiff(git, 'a.ts', true, false)).toContain('+two')
    await unstage(git, ['b.ts'])
    expect((await status(git)).files.find((f) => f.path === 'b.ts')?.untracked).toBe(true)
  })

  it('commits, lists branches and switches', async () => {
    const { dir, git } = repo()
    writeFileSync(join(dir, 'a.ts'), 'changed\n')
    await stage(git, ['a.ts'])
    await expect(commit(git, '  ')).rejects.toThrow('commit message')
    await commit(git, 'change a')
    await git(['branch', 'feature'])
    expect(await branches(git)).toEqual([{ name: 'feature', current: false, upstream: '' }, { name: 'main', current: true, upstream: '' }])
    await checkout(git, 'feature')
    expect((await status(git)).branch).toBe('feature')
    await expect(checkout(git, '--orphan')).rejects.toThrow('Not a branch name')
    const l = await log(git)
    expect(l.map((c) => c.subject)).toEqual(['change a', 'first'])
    expect(l[0]!.refs.join(' ')).toContain('feature')
  })

  it('reads renames in porcelain v2', () => {
    const out = ['# branch.head main', '# branch.ab +2 -1', '2 R. N... 100644 100644 100644 aaa bbb R100 new.ts', 'old.ts', ''].join('\0')
    expect(parseStatus(out)).toMatchObject({ ahead: 2, behind: 1, files: [{ path: 'new.ts', staged: 'R' }] })
  })

  it('lays out lanes for a merge', () => {
    // m merges b into a; both come from root
    const c = (sha: string, parents: string[]) => ({ sha, parents, author: '', when: '', subject: sha, refs: [] })
    const laid = lanes([c('m', ['a', 'b']), c('b', ['r']), c('a', ['r']), c('r', [])])
    expect(laid.map((x) => [x.sha, x.lane])).toEqual([['m', 0], ['b', 1], ['a', 0], ['r', 0]])
    expect(laid[0]!.lines).toEqual([{ from: 0, to: 0 }, { from: 0, to: 1 }])
  })
})
