import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Checkpoints } from './checkpoints'

let root = ''
let repo = ''
let cp: Checkpoints
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim()

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stm-cps-'))
  repo = join(root, 'repo')
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n')
  writeFileSync(join(repo, 'a.txt'), 'one\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  cp = new Checkpoints(join(root, 'cps'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('checkpoints on a temp repo', () => {
  it('creates private refs without touching branches, HEAD, the stash or the index', async () => {
    const head = git('rev-parse', 'HEAD')
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    writeFileSync(join(repo, 'new.txt'), 'n\n')
    const r = await cp.create(repo, { panel: 'p1', sessionId: 's1', turn: 0, messageUuid: 'm1' })
    if ('skipped' in r) throw new Error(r.skipped)
    expect(r.rec.ref).toBe('refs/stm/checkpoints/p1/0')
    expect(git('rev-parse', r.rec.ref)).toBe(r.rec.sha)
    expect(r.files.sort((a, b) => a.path.localeCompare(b.path))).toEqual([{ path: 'a.txt', change: 'M' }, { path: 'new.txt', change: 'A' }])
    expect(git('rev-parse', 'HEAD')).toBe(head)
    expect(git('branch', '--list')).toBe('* main')
    expect(git('stash', 'list')).toBe('')
    expect(git('status', '--porcelain').split('\n').sort()).toEqual(['?? new.txt', 'M a.txt'])
  })
  it('restores files to a turn, removes files added since, leaves HEAD and branches, and returns the resume fork', async () => {
    writeFileSync(join(repo, 'a.txt'), 'two\n')
    writeFileSync(join(repo, 'keep.txt'), 'k\n')
    writeFileSync(join(repo, 'ignored.txt'), 'ignored\n')
    await cp.create(repo, { panel: 'p1', sessionId: 's1', turn: 0, messageUuid: 'm0' })
    writeFileSync(join(repo, 'a.txt'), 'three\n')
    writeFileSync(join(repo, 'later.txt'), 'l\n')
    writeFileSync(join(repo, 'ignored.txt'), 'changed\n')
    await cp.create(repo, { panel: 'p1', sessionId: 's1', turn: 1, messageUuid: 'm1' })
    const head = git('rev-parse', 'HEAD')
    const pre = await cp.preview(repo, 'p1', 0)
    expect(pre.files.map((f) => f.path).sort()).toEqual(['a.txt', 'later.txt'])
    const r = await cp.restore(repo, 'p1', 0)
    expect(r.resume).toEqual({ sessionId: 's1', messageUuid: 'm0', forkSession: true })
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('two\n')
    expect(existsSync(join(repo, 'later.txt'))).toBe(false)
    expect(existsSync(join(repo, 'keep.txt'))).toBe(true)
    expect(readFileSync(join(repo, 'ignored.txt'), 'utf8')).toBe('changed\n')
    expect(git('rev-parse', 'HEAD')).toBe(head)
    expect(git('branch', '--list')).toBe('* main')
    expect(git('status', '--porcelain').split('\n').sort()).toEqual(['?? keep.txt', 'M a.txt'])
  })
  it('says so when the branch moved since the checkpoint', async () => {
    await cp.create(repo, { panel: 'p1', sessionId: 's1', turn: 0, messageUuid: 'm0' })
    writeFileSync(join(repo, 'b.txt'), 'b\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'second')
    const pre = await cp.preview(repo, 'p1', 0)
    expect(pre.notes.join(' ')).toMatch(/branch moved/)
  })
  it('skips a folder that is not a git project, and prunes beyond 50', async () => {
    const plain = join(root, 'plain')
    execFileSync('mkdir', [plain])
    const r = await cp.create(plain, { panel: 'p2', sessionId: 's', turn: 0, messageUuid: 'm' })
    expect(r).toEqual({ skipped: 'Checkpoints need a git project.' })
    for (let t = 0; t < 52; t++) await cp.create(repo, { panel: 'p3', sessionId: 's', turn: t, messageUuid: 'm' })
    expect(cp.list('p3')).toHaveLength(50)
    expect(git('for-each-ref', 'refs/stm/checkpoints/p3')).not.toContain('/p3/0\n')
    expect(cp.nextTurn('p3')).toBe(52)
  }, 60_000)
  it('prunes the refs of a panel closed more than 7 days ago, and only that panel', async () => {
    await cp.create(repo, { panel: 'old', sessionId: 's', turn: 0, messageUuid: 'm' })
    await cp.create(repo, { panel: 'fresh', sessionId: 's', turn: 0, messageUuid: 'm' })
    const t = Date.now()
    cp.markClosed('old', repo, t - 8 * 86_400_000)
    cp.markClosed('fresh', repo, t - 86_400_000)
    expect(await cp.pruneClosed(t)).toEqual(['old'])
    expect(git('for-each-ref', 'refs/stm/checkpoints/old')).toBe('')
    expect(git('for-each-ref', 'refs/stm/checkpoints/fresh')).toContain('fresh/0')
    expect(cp.list('old')).toEqual([])
  })
})
