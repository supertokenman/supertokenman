import { describe, expect, it } from 'vitest'
import { createPlan, pruneList, pruneStep, refName, restorePlan, type Step } from './checkpoint'

const SHA = 'a'.repeat(40)
const ALLOWED_ARGV0 = new Set(['add', 'write-tree', 'commit-tree', 'update-ref', 'read-tree', 'clean'])
const BRANCHY = /refs\/heads|^HEAD$|^branch$|^stash$|symbolic-ref|^origin$|^main$|^master$/

function assertNoBranchTouch(steps: Step[]) {
  for (const s of steps) {
    expect(ALLOWED_ARGV0.has(s.argv[0]!)).toBe(true)
    for (const a of s.argv) expect(a).not.toMatch(BRANCHY)
    if (s.argv[0] === 'update-ref') expect(s.argv[1]!.startsWith('refs/stm/checkpoints/') || s.argv[2] === '-d').toBe(true)
  }
}

describe('refName', () => {
  it('builds private checkpoint refs and rejects bad input', () => {
    expect(refName('p1', 3)).toBe('refs/stm/checkpoints/p1/3')
    expect(() => refName('../x', 1)).toThrow()
    expect(() => refName('p1', -1)).toThrow()
    expect(() => refName('p1', 1.5)).toThrow()
  })
})

describe('createPlan', () => {
  it('stages the tree in a temporary index, commits it and points the private ref at it', () => {
    const { ref, steps } = createPlan({ panel: 'p1', turn: 4, indexFile: '/tmp/idx', head: SHA })
    expect(ref).toBe('refs/stm/checkpoints/p1/4')
    expect(steps.map((s) => s.argv[0])).toEqual(['add', 'write-tree', 'commit-tree', 'update-ref'])
    expect(steps[0]!.env).toEqual({ GIT_INDEX_FILE: '/tmp/idx' })
    expect(steps[1]).toMatchObject({ capture: 'tree' })
    expect(steps[2]!.argv).toEqual(['commit-tree', '{tree}', '-p', SHA, '-m', 'checkpoint p1 turn 4'])
    expect(steps[2]).toMatchObject({ capture: 'commit' })
    expect(steps[3]!.argv).toEqual(['update-ref', 'refs/stm/checkpoints/p1/4', '{commit}'])
  })

  it('has no parent without a head', () => {
    const { steps } = createPlan({ panel: 'p1', turn: 0, indexFile: '/tmp/idx' })
    expect(steps[2]!.argv).not.toContain('-p')
  })

  it('never writes a branch, HEAD, the stash or a remote', () => {
    assertNoBranchTouch(createPlan({ panel: 'p1', turn: 1, indexFile: '/tmp/idx', head: SHA }).steps)
  })

  it('rejects a bad head sha and an empty index file', () => {
    expect(() => createPlan({ panel: 'p1', turn: 1, indexFile: '/tmp/idx', head: 'main' })).toThrow()
    expect(() => createPlan({ panel: 'p1', turn: 1, indexFile: '' })).toThrow()
  })
})

describe('restorePlan', () => {
  it('reads the checkpoint tree into the index and worktree, then removes the listed files', () => {
    const steps = restorePlan({ panel: 'p1', turn: 2, sha: SHA, remove: ['src/new.ts', 'notes/a.md'] })
    expect(steps).toEqual([
      { argv: ['read-tree', '--reset', '-u', SHA] },
      { argv: ['clean', '-f', '--', 'src/new.ts', 'notes/a.md'] },
    ])
  })

  it('has no removal step when nothing is to remove', () => {
    expect(restorePlan({ panel: 'p1', turn: 2, sha: SHA, remove: [] })).toHaveLength(1)
  })

  it('never writes a branch, HEAD, the stash or a remote', () => {
    assertNoBranchTouch(restorePlan({ panel: 'p1', turn: 2, sha: SHA, remove: ['a.ts'] }))
  })

  it('refuses paths outside the worktree, options, and bad shas', () => {
    expect(() => restorePlan({ panel: 'p1', turn: 2, sha: SHA, remove: ['../etc/x'] })).toThrow()
    expect(() => restorePlan({ panel: 'p1', turn: 2, sha: SHA, remove: ['/etc/x'] })).toThrow()
    expect(() => restorePlan({ panel: 'p1', turn: 2, sha: SHA, remove: ['-fd'] })).toThrow()
    expect(() => restorePlan({ panel: 'p1', turn: 2, sha: 'main', remove: [] })).toThrow()
  })
})

describe('pruneList and pruneStep', () => {
  const entries = Array.from({ length: 53 }, (_, i) => ({ turn: i, ref: refName('p1', i) }))

  it('keeps the newest 50 turns and lists the rest', () => {
    const drop = pruneList(entries)
    expect(drop).toHaveLength(3)
    expect(drop).toEqual(['refs/stm/checkpoints/p1/2', 'refs/stm/checkpoints/p1/1', 'refs/stm/checkpoints/p1/0'])
  })

  it('lists every ref once the panel closed more than 7 days ago', () => {
    const day = 86_400_000
    expect(pruneList(entries, { now: 10 * day, closedAt: 0 })).toHaveLength(53)
    expect(pruneList(entries, { now: 6 * day, closedAt: 0 })).toHaveLength(3)
  })

  it('turns a ref into an update-ref delete, and refuses anything outside checkpoints', () => {
    expect(pruneStep('refs/stm/checkpoints/p1/0')).toEqual({ argv: ['update-ref', '-d', 'refs/stm/checkpoints/p1/0'] })
    expect(() => pruneStep('refs/heads/main')).toThrow()
  })
})
