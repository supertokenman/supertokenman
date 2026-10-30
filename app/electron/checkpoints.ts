// Checkpoints: at each turn end the worktree is recorded as a commit object under a private ref
// (refs/stm/checkpoints/<panel>/<turn>). No branch, no HEAD move, no stash entry. The git commands come from
// shared/checkpoint.ts; this file runs them and keeps the list in <userData>/checkpoints/<panel>.json.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPlan, pruneList, pruneStep, restorePlan, type Step } from '../shared/checkpoint.js'

export type CheckpointRec = { panel: string; sessionId: string; turn: number; ref: string; sha: string; head: string; messageUuid: string; at: number }
export type FileChange = { path: string; change: 'A' | 'M' | 'D' }
export const MAX_CHANGED = 20_000

const run = (cwd: string, argv: string[], env: Record<string, string> = {}) =>
  new Promise<string>((ok, bad) => {
    execFile('git', argv, { cwd, env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }, (err, out, e) => (err ? bad(new Error(String(e || err.message).trim().split('\n').at(-1))) : ok(String(out))))
  })

/** Whether `cwd` is inside a git worktree. */
export async function isGit(cwd: string): Promise<boolean> {
  return run(cwd, ['rev-parse', '--is-inside-work-tree']).then((o) => o.trim() === 'true', () => false)
}

async function exec(cwd: string, steps: Step[]): Promise<Record<string, string>> {
  const got: Record<string, string> = {}
  for (const s of steps) {
    const argv = s.argv.map((a) => a.replace(/\{(tree|commit)\}/g, (_m, k: string) => got[k] ?? ''))
    const out = (await run(cwd, argv, s.env)).trim()
    if (s.capture) got[s.capture] = out
  }
  return got
}

const parseDiff = (out: string): FileChange[] =>
  out
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      const [c, ...rest] = l.split('\t')
      const path = rest.join('\t')
      return path && (c === 'A' || c === 'M' || c === 'D') ? [{ path, change: c }] : []
    })

/** Files that differ between two commits or trees. */
export async function changedBetween(cwd: string, a: string, b: string): Promise<FileChange[]> {
  return parseDiff(await run(cwd, ['diff', '--name-status', '--no-renames', a, b]))
}

export class Checkpoints {
  constructor(private dir: string) {}
  private file = (panel: string) => join(this.dir, `${panel}.json`)

  list(panel: string): CheckpointRec[] {
    try {
      const v = JSON.parse(readFileSync(this.file(panel), 'utf8')) as { list?: CheckpointRec[] }
      return Array.isArray(v.list) ? v.list : []
    } catch {
      return []
    }
  }
  private save(panel: string, list: CheckpointRec[]) {
    mkdirSync(this.dir, { recursive: true })
    const f = this.file(panel)
    writeFileSync(`${f}.tmp`, JSON.stringify({ list }))
    renameSync(`${f}.tmp`, f)
  }
  /** The next turn number for a panel: after the newest checkpoint kept. */
  nextTurn(panel: string): number {
    const l = this.list(panel)
    return l.length ? Math.max(...l.map((x) => x.turn)) + 1 : 0
  }

  /**
   * Records the worktree as checkpoint `turn`. Null with a reason when the folder is not a git project or has
   * more than 20k changed files. `files` are the changes since the previous checkpoint (the delivery receipt).
   */
  async create(cwd: string, input: { panel: string; sessionId: string; turn: number; messageUuid: string; at?: number }): Promise<{ rec: CheckpointRec; files: FileChange[] } | { skipped: string }> {
    if (!(await isGit(cwd))) return { skipped: 'Checkpoints need a git project.' }
    const status = await run(cwd, ['status', '--porcelain']).catch(() => '')
    if (status.split('\n').filter(Boolean).length > MAX_CHANGED) return { skipped: `Checkpoint skipped: more than ${MAX_CHANGED} changed files.` }
    const head = (await run(cwd, ['rev-parse', 'HEAD']).catch(() => '')).trim()
    const tmp = mkdtempSync(join(tmpdir(), 'stm-cp-'))
    try {
      const plan = createPlan({ panel: input.panel, turn: input.turn, indexFile: join(tmp, 'index'), ...(/^[0-9a-f]{40,64}$/.test(head) ? { head } : {}) })
      const got = await exec(cwd, plan.steps)
      const sha = got.commit ?? ''
      const prev = this.list(input.panel).at(-1)
      const files = prev ? await changedBetween(cwd, prev.sha, sha).catch(() => []) : head ? await changedBetween(cwd, head, sha).catch(() => []) : []
      const rec: CheckpointRec = { panel: input.panel, sessionId: input.sessionId, turn: input.turn, ref: plan.ref, sha, head, messageUuid: input.messageUuid, at: input.at ?? Date.now() }
      const all = [...this.list(input.panel).filter((x) => x.turn !== rec.turn), rec]
      const drop = new Set(pruneList(all.map((x) => ({ turn: x.turn, ref: x.ref }))))
      for (const ref of drop) await exec(cwd, [pruneStep(ref)]).catch(() => undefined)
      this.save(input.panel, all.filter((x) => !drop.has(x.ref)))
      return { rec, files }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  /** The files a restore to `turn` would change (what the confirmation card lists), and the notes for the card. */
  async preview(cwd: string, panel: string, turn: number): Promise<{ rec: CheckpointRec; files: FileChange[]; notes: string[] }> {
    const rec = this.list(panel).find((x) => x.turn === turn)
    if (!rec) throw new Error(`No checkpoint for turn ${turn}.`)
    const now = await this.snapshotCommit(cwd)
    const files = await changedBetween(cwd, now, rec.sha)
    const head = (await run(cwd, ['rev-parse', 'HEAD']).catch(() => '')).trim()
    const notes = ['Files that .gitignore ignores are not restored.']
    if (rec.head && head && rec.head !== head) notes.push('The branch moved since this checkpoint (a commit was made). Files are restored; the branch is not reset.')
    return { rec, files, notes }
  }

  /** An unreferenced commit of the worktree right now, used to compare and to find files added since. */
  private async snapshotCommit(cwd: string): Promise<string> {
    const tmp = mkdtempSync(join(tmpdir(), 'stm-cp-'))
    try {
      const index = { GIT_INDEX_FILE: join(tmp, 'index') }
      await run(cwd, ['add', '-A'], index)
      return (await run(cwd, ['write-tree'], index)).trim()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  /**
   * Puts the files of checkpoint `turn` back; HEAD and branches stay. Files untracked now and absent from the
   * checkpoint are removed. Returns what the panel needs to start the conversation again from that turn.
   */
  async restore(cwd: string, panel: string, turn: number): Promise<{ files: FileChange[]; notes: string[]; resume: { sessionId: string; messageUuid: string; forkSession: true } }> {
    const { rec, files, notes } = await this.preview(cwd, panel, turn)
    const inCp = new Set((await run(cwd, ['ls-tree', '-r', '--name-only', rec.sha])).split('\n').filter(Boolean))
    const untracked = (await run(cwd, ['ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean)
    const remove = untracked.filter((p) => !inCp.has(p))
    await exec(cwd, restorePlan({ panel, turn, sha: rec.sha, remove }))
    // read-tree staged the checkpoint's files; put the index back to HEAD so nothing looks staged that was not
    await run(cwd, ['reset', '-q']).catch(() => undefined)
    return { files, notes, resume: { sessionId: rec.sessionId, messageUuid: rec.messageUuid, forkSession: true } }
  }

  /** The panel closed: its refs are pruned on a start more than 7 days after this. */
  markClosed(panel: string, cwd: string, at = Date.now()) {
    const l = this.list(panel)
    if (!l.length) return
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.file(panel), JSON.stringify({ list: l, closedAt: at, cwd }))
  }
  /** Deletes the refs and the list of every panel closed more than 7 days before `now`. */
  async pruneClosed(now = Date.now()): Promise<string[]> {
    const done: string[] = []
    let names: string[] = []
    try {
      names = readdirSync(this.dir)
    } catch {
      return done
    }
    for (const n of names.filter((x) => x.endsWith('.json'))) {
      const panel = n.slice(0, -5)
      let v: { list?: CheckpointRec[]; closedAt?: number; cwd?: string } = {}
      try {
        v = JSON.parse(readFileSync(this.file(panel), 'utf8'))
      } catch {
        continue
      }
      if (v.closedAt === undefined || !v.list?.length) continue
      const drop = pruneList(v.list.map((x) => ({ turn: x.turn, ref: x.ref })), { now, closedAt: v.closedAt })
      if (!drop.length) continue
      if (v.cwd && existsSync(v.cwd)) for (const ref of drop) await exec(v.cwd, [pruneStep(ref)]).catch(() => undefined)
      rmSync(this.file(panel), { force: true })
      done.push(panel)
    }
    return done
  }
}
