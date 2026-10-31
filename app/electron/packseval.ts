// Pack eval (spec-packs.md section 8, T11): the same task in two worktrees of the project, one with the pack
// installed and one without, then the comparison from shared/packeval.ts. The panels are ordinary worktree
// panels started through main's own session path; this module only sets the two folders up, sends the prompt,
// collects usage and takes everything down on discard. Nothing here touches the network.

import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Attempt, TestRun } from '../shared/fanout.js'
import { comparePackEval, type EvalComparison, type EvalSide } from '../shared/packeval.js'
import type { Packs } from './packs.js'
import type { Worktree } from './worktree.js'

export type EvalWorktree = Worktree & { group?: string; attempt?: number; of?: number }

type Stat = { files: number; added: number; removed: number; list?: { path: string; added: number; removed: number }[] }

export type EvalDeps = {
  packs: Packs
  worktreesHome: () => string
  createWorktree: (cwd: string, home: string, label: string) => Promise<Worktree>
  dropWorktree: (w: Worktree) => Promise<boolean>
  worktreeStat: (w: Worktree) => Promise<Stat>
  /** Remember the worktree so a panel opened on it is treated as one (main's settings list). */
  remember: (w: EvalWorktree) => void
  forget: (w: Worktree) => void
  /** Opens a panel on this folder; the panel's id. */
  open: (cwd: string, model: string) => Promise<string>
  /** Sends the prompt the way a typed message goes; true when it was sent. */
  send: (sid: string, text: string) => Promise<boolean>
  usage: (sid: string) => { turns: number; usd?: number; tokens?: number }
  busy: (sid: string) => boolean
  interrupt: (sid: string) => Promise<void>
  /** Runs the project's tests in that panel's worktree; null or a throw when it has no test command. */
  tests: (sid: string) => Promise<TestRun | null>
  now?: () => number
  /** Poll interval of the watcher in ms; tests set it small. */
  pollMs?: number
}

type SideRec = { baseline?: Stat['list']; sid: string; wt: Worktree; sent: boolean; failed: string | null; endedAt: number | null; capped: boolean }
type Rec = { id: string; packId: string; version: string; root: string; prompt: string; model: string; maxTurns: number; startedAt: number; with: SideRec; without: SideRec; timer: ReturnType<typeof setInterval> | null }

/** The diff of a worktree without what the pack's install wrote: a file whose counts did not move since the
 *  install is dropped, one the task changed further keeps only the difference. */
export function withoutBaseline(st: Stat, baseline: Stat['list']): Stat {
  if (!baseline?.length || !st.list) return st
  const was = new Map(baseline.map((x) => [x.path, x]))
  const list = st.list.flatMap((x) => {
    const b = was.get(x.path)
    if (!b) return [x]
    const added = Math.max(0, x.added - b.added)
    const removed = Math.max(0, x.removed - b.removed)
    return added || removed ? [{ path: x.path, added, removed }] : []
  })
  return { files: list.length, added: list.reduce((n, x) => n + x.added, 0), removed: list.reduce((n, x) => n + x.removed, 0), list }
}

export function createPackEval(d: EvalDeps) {
  const evals = new Map<string, Rec>()
  const now = () => (d.now ?? Date.now)()
  let seq = 0

  const sidesOf = (r: Rec) => [r.with, r.without]

  function watch(r: Rec) {
    r.timer = setInterval(() => {
      for (const s of sidesOf(r)) {
        if (s.endedAt !== null) continue
        if (s.failed) {
          s.endedAt = now()
          continue
        }
        if (!s.sent) continue
        if (d.busy(s.sid)) {
          if (d.usage(s.sid).turns >= r.maxTurns) {
            s.capped = true
            void d.interrupt(s.sid).catch(() => undefined)
          }
          continue
        }
        s.endedAt = now()
      }
      if (sidesOf(r).every((s) => s.endedAt !== null) && r.timer) (clearInterval(r.timer), (r.timer = null))
    }, d.pollMs ?? 1000)
    r.timer.unref?.()
  }

  async function start(packId: string, root: string, prompt: string, model: string, maxTurns: number) {
    const state = d.packs.loadState().state
    const inst = d.packs.installsFor(root, state).find((i) => i.packId === packId && i.scope === 'project')
    const res = d.packs.resolvePack(packId, inst?.version)
    if (!res.ok) throw new Error(res.errors.join('; '))
    const version = res.scan.manifest.version
    const id = `e${now().toString(36)}${++seq}`
    const made: EvalWorktree[] = []
    const mk = async (label: string, attempt: number) => {
      const w = await d.createWorktree(root, d.worktreesHome(), label)
      const wt = { ...w, group: id, attempt, of: 2 }
      made.push(wt)
      d.remember(wt)
      return wt
    }
    try {
      const withWt = await mk('pack-eval-with', 1)
      const withoutWt = await mk('pack-eval-without', 2)
      // the pack goes into one worktree only; the same manifest was allowed already, so no second review.
      // A copy committed to the repo would be in both: the "without" side loses it, the "with" side overwrites.
      const plan = d.packs.review(packId, version, 'project', withWt.path)
      if (!plan.ok) throw new Error(plan.errors.join('; '))
      const decisions: Record<string, 'overwrite'> = {}
      for (const f of plan.view.files) decisions[f.to] = 'overwrite'
      d.packs.install(packId, version, 'project', withWt.path, decisions)
      // its servers on in that worktree only, the ones that were on for the project
      for (const [server, on] of Object.entries(inst?.mcpEnabled ?? {})) if (on && !server.includes('@')) d.packs.setMcp(packId, withWt.path, server, true)
      for (const sub of [`.claude/skills/${packId}`, `.claude/packs/${packId}`]) if (existsSync(join(withoutWt.path, sub))) rmSync(join(withoutWt.path, sub), { recursive: true, force: true })

      // what the install itself changed: taken off the "with" side later, so only the task's own changes count
      const installed = await d.worktreeStat(withWt).catch(() => null)
      const sidWith = await d.open(withWt.path, model)
      const sidWithout = await d.open(withoutWt.path, model)
      const rec: Rec = {
        id,
        packId,
        version,
        root,
        prompt,
        model,
        maxTurns,
        startedAt: now(),
        with: { baseline: installed?.list, sid: sidWith, wt: withWt, sent: false, failed: null, endedAt: null, capped: false },
        without: { sid: sidWithout, wt: withoutWt, sent: false, failed: null, endedAt: null, capped: false },
        timer: null,
      }
      evals.set(id, rec)
      watch(rec)
      for (const s of sidesOf(rec)) {
        d.send(s.sid, prompt).then(
          (ok) => {
            s.sent = ok
            if (!ok) s.failed = 'The prompt was not sent (held by a budget or a limit).'
          },
          (e: unknown) => {
            s.failed = e instanceof Error ? e.message : String(e)
          },
        )
      }
      // what the window needs to show the two panels it did not open itself
      const at = (sid: string, w: Worktree) => ({ sid, cwd: w.path, branch: w.branch, base: w.base, repo: w.repo })
      return { evalId: id, panels: { with: sidWith, without: sidWithout }, opened: { with: at(sidWith, withWt), without: at(sidWithout, withoutWt) }, hosts: res.scan.manifest.hosts, version }
    } catch (e) {
      for (const w of made) {
        try {
          d.packs.remove(packId, w.path, false)
        } catch {
          // it was not installed there
        }
        d.forget(w)
        await d.dropWorktree(w).catch(() => false)
      }
      throw e
    }
  }

  async function sideOf(r: Rec, s: SideRec, attempt: number): Promise<EvalSide> {
    const u = d.usage(s.sid)
    const st = withoutBaseline(await d.worktreeStat(s.wt).catch((): Stat => ({ files: 0, added: 0, removed: 0 })), s.baseline)
    const busy = d.busy(s.sid) || !s.sent
    const base: Attempt = { sid: s.sid, attempt, model: r.model, busy: busy && !s.failed, costUsd: u.usd ?? 0, ms: (s.endedAt ?? now()) - r.startedAt, files: st.files, added: st.added, removed: st.removed, tests: null }
    return { ...base, turns: u.turns, tokens: u.tokens ?? 0, ok: !s.failed, capped: s.capped }
  }

  /** The comparison so far. Tests run when both sides are done and the project has a test command. */
  async function result(evalId: string): Promise<{ evalId: string; packId: string; version: string; finished: boolean; withPack: EvalSide; without: EvalSide; comparison: EvalComparison; errors: string[] }> {
    const r = evals.get(evalId)
    if (!r) throw new Error('No such eval (it may have been discarded or the app restarted).')
    const [a, b] = [await sideOf(r, r.with, 1), await sideOf(r, r.without, 2)]
    const finished = !a.busy && !b.busy
    if (finished) {
      if (a.tests === null) a.tests = await d.tests(r.with.sid).catch(() => null)
      if (b.tests === null) b.tests = await d.tests(r.without.sid).catch(() => null)
    }
    return { evalId, packId: r.packId, version: r.version, finished, withPack: a, without: b, comparison: comparePackEval(a, b), errors: sidesOf(r).flatMap((s) => (s.failed ? [s.failed] : [])) }
  }

  /** Both worktrees dropped, the pack's record in the worktree removed. The panels close in the window. */
  async function discard(evalId: string) {
    const r = evals.get(evalId)
    if (!r) return { ok: false as const, panels: [] as string[] }
    if (r.timer) clearInterval(r.timer)
    evals.delete(evalId)
    try {
      d.packs.remove(r.packId, r.with.wt.path, false)
    } catch {
      // not installed there any more
    }
    const ok: boolean[] = []
    for (const s of sidesOf(r)) {
      d.forget(s.wt)
      ok.push(await d.dropWorktree(s.wt).catch(() => false))
    }
    return { ok: ok.every(Boolean), panels: sidesOf(r).map((s) => s.sid) }
  }

  return { start, result, discard, has: (id: string) => evals.has(id) }
}

export type PackEval = ReturnType<typeof createPackEval>
