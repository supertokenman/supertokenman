// The git commands behind checkpoints, as argv sequences. Pure: electron/checkpoints.ts runs them, in a
// worktree, with the env given. Checkpoints live in private refs (refs/stm/checkpoints/<panel>/<turn>); no
// command here writes a branch, HEAD, the stash or a remote. The index is only touched by restore (read-tree).

export type Step = {
  argv: string[]
  env?: Record<string, string>
  /** the stdout of this step, stored under this name for later steps (`{tree}`, `{commit}`) */
  capture?: 'tree' | 'commit'
}

const PANEL = /^[A-Za-z0-9_-]{1,64}$/
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const DAY_MS = 86_400_000
export const KEEP_REFS = 50
export const CLOSED_DAYS = 7
const IDENTITY = {
  GIT_AUTHOR_NAME: 'SuperTokenMan',
  GIT_AUTHOR_EMAIL: 'checkpoints@supertokenman.local',
  GIT_COMMITTER_NAME: 'SuperTokenMan',
  GIT_COMMITTER_EMAIL: 'checkpoints@supertokenman.local',
}

function checkPanel(panel: string, turn: number) {
  if (!PANEL.test(panel)) throw new Error(`checkpoint: bad panel id "${panel}"`)
  if (!Number.isInteger(turn) || turn < 0) throw new Error(`checkpoint: bad turn ${turn}`)
}

/** The private ref of a panel's checkpoint at a turn. */
export function refName(panel: string, turn: number): string {
  checkPanel(panel, turn)
  return `refs/stm/checkpoints/${panel}/${turn}`
}

/**
 * The commands that record the worktree as a checkpoint: the working tree and untracked files (not ignored
 * ones) are staged into a temporary index, written as a tree, wrapped in a commit object and pointed at by
 * the private ref. `head` becomes the parent when given.
 */
export function createPlan(input: { panel: string; turn: number; indexFile: string; head?: string; message?: string }): { ref: string; steps: Step[] } {
  const { panel, turn, indexFile, head } = input
  checkPanel(panel, turn)
  if (head !== undefined && !SHA.test(head)) throw new Error(`checkpoint: bad head ${head}`)
  if (!indexFile) throw new Error('checkpoint: a temporary index file is needed')
  const ref = refName(panel, turn)
  const message = input.message ?? `checkpoint ${panel} turn ${turn}`
  const index = { GIT_INDEX_FILE: indexFile }
  return {
    ref,
    steps: [
      { argv: ['add', '-A'], env: index },
      { argv: ['write-tree'], env: index, capture: 'tree' },
      { argv: ['commit-tree', '{tree}', ...(head ? ['-p', head] : []), '-m', message], env: IDENTITY, capture: 'commit' },
      { argv: ['update-ref', ref, '{commit}'] },
    ],
  }
}

/** A path to remove on restore: relative, inside the worktree, not an option. */
function safePath(p: string): string {
  if (!p || p.startsWith('-') || p.startsWith('/') || p.includes('\0') || p.split('/').includes('..')) throw new Error(`checkpoint: unsafe path "${p}"`)
  return p
}

/**
 * The commands that put a checkpoint's files back: the index and working tree take the checkpoint's tree
 * (HEAD and branches stay), then the files that are untracked now and were not at the checkpoint are removed.
 * `remove` is computed by the caller.
 */
export function restorePlan(input: { panel: string; turn: number; sha: string; remove: string[] }): Step[] {
  const { panel, turn, sha, remove } = input
  checkPanel(panel, turn)
  if (!SHA.test(sha)) throw new Error(`checkpoint: bad sha ${sha}`)
  const steps: Step[] = [{ argv: ['read-tree', '--reset', '-u', sha] }]
  if (remove.length) steps.push({ argv: ['clean', '-f', '--', ...remove.map(safePath)] })
  return steps
}

/** The command that deletes a checkpoint ref. */
export function pruneStep(ref: string): Step {
  if (!ref.startsWith('refs/stm/checkpoints/')) throw new Error(`checkpoint: refusing to delete ${ref}`)
  return { argv: ['update-ref', '-d', ref] }
}

/**
 * The refs to delete for one panel: all of them once the panel was closed more than `closedDays` ago,
 * otherwise every ref beyond the newest `keep` turns.
 */
export function pruneList(
  entries: { turn: number; ref: string }[],
  opts: { keep?: number; now?: number; closedAt?: number; closedDays?: number } = {},
): string[] {
  const keep = opts.keep ?? KEEP_REFS
  if (opts.closedAt !== undefined && opts.now !== undefined && opts.now - opts.closedAt > (opts.closedDays ?? CLOSED_DAYS) * DAY_MS) {
    return entries.map((e) => e.ref)
  }
  return [...entries].sort((a, b) => b.turn - a.turn).slice(keep).map((e) => e.ref)
}
