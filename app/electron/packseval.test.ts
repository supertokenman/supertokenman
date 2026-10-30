import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPacks } from './packs'
import { createPackEval, type EvalWorktree } from './packseval'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pkev-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const put = (dir: string, rel: string, text: string) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

function rig(opts: { sendOk?: boolean; busyFor?: Record<string, boolean> } = {}) {
  const src = join(tmp, 'src')
  put(src, 'pack.json', JSON.stringify({ schema: 1, id: 'evalpack', name: 'E', version: '1.0.0', description: 'd', files: [{ from: 's.md', to: '.claude/skills/evalpack/s.md', kind: 'skill' }], mcp: [{ name: 'docs', type: 'http', url: 'https://docs.example.com/mcp' }], hosts: ['docs.example.com'] }))
  put(src, 's.md', 'skill')
  const root = join(tmp, 'proj')
  mkdirSync(root)
  const packs = createPacks({ userData: join(tmp, 'ud'), enginesDir: join(tmp, 'eng'), claudeDir: () => join(tmp, 'home/.claude'), vaultGet: () => undefined })
  expect(packs.addFolder(src).ok).toBe(true)
  const dropped: string[] = []
  const remembered: EvalWorktree[] = []
  const forgot: string[] = []
  const sent: Record<string, string> = {}
  const busy: Record<string, boolean> = opts.busyFor ?? {}
  let n = 0
  const usage: Record<string, { turns: number; usd?: number; tokens?: number }> = {}
  const ev = createPackEval({
    packs,
    worktreesHome: () => join(tmp, 'wt'),
    createWorktree: async (_cwd, home, label) => {
      const path = join(home, `${label}-${++n}`)
      mkdirSync(path, { recursive: true })
      // a copy of the pack committed to the repo shows up in both checkouts
      if (label === 'pack-eval-without') put(path, '.claude/skills/evalpack/s.md', 'committed')
      return { repo: root, path, branch: `stm/${label}`, base: 'main' }
    },
    dropWorktree: async (w) => (dropped.push(w.path), rmSync(w.path, { recursive: true, force: true }), true),
    worktreeStat: async (w) => ({ files: w.path.includes('-with') ? 2 : 2, added: 5, removed: 1 }),
    remember: (w) => remembered.push(w),
    forget: (w) => forgot.push(w.path),
    open: async (cwd) => `s-${cwd.includes('without') ? 'without' : 'with'}`,
    send: async (sid, text) => ((sent[sid] = text), opts.sendOk ?? true),
    usage: (sid) => usage[sid] ?? { turns: 1, usd: 0.5, tokens: 1000 },
    busy: (sid) => busy[sid] ?? false,
    interrupt: async (sid) => void (busy[sid] = false),
    tests: async () => null,
    pollMs: 5,
  })
  return { ev, packs, root, dropped, remembered, forgot, sent, busy, usage }
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

describe('pack eval', () => {
  it('makes two worktrees, installs the pack into one only, and sends the same prompt to both', async () => {
    const r = rig()
    const out = await r.ev.start('evalpack', r.root, 'do the thing', 'claude-sonnet-5-5', 30)
    expect(out.panels).toEqual({ with: 's-with', without: 's-without' })
    expect(out.hosts).toEqual(['docs.example.com'])
    expect(r.remembered.map((w) => [w.group, w.attempt, w.of])).toEqual([[out.evalId, 1, 2], [out.evalId, 2, 2]])
    const [withWt, withoutWt] = r.remembered
    expect(readFileSync(join(withWt!.path, '.claude/skills/evalpack/s.md'), 'utf8')).toBe('skill')
    // the committed copy is gone from the other side, and the pack was not installed there
    expect(existsSync(join(withoutWt!.path, '.claude/skills/evalpack'))).toBe(false)
    expect(r.packs.installed(withWt!.path).installs).toHaveLength(1)
    expect(r.packs.installed(withoutWt!.path).installs).toHaveLength(0)
    // nothing in the project itself
    expect(existsSync(join(r.root, '.claude'))).toBe(false)
    await tick()
    expect(r.sent).toEqual({ 's-with': 'do the thing', 's-without': 'do the thing' })
  })

  it('reports running, then the comparison, and runs nothing twice', async () => {
    const r = rig({ busyFor: { 's-with': true, 's-without': true } })
    const out = await r.ev.start('evalpack', r.root, 'p', 'claude-sonnet-5-5', 30)
    await tick()
    let res = await r.ev.result(out.evalId)
    expect(res.finished).toBe(false)
    expect(res.comparison.verdict).toMatch(/still running/)
    r.busy['s-with'] = false
    r.busy['s-without'] = false
    r.usage['s-with'] = { turns: 2, usd: 0.4, tokens: 900 }
    r.usage['s-without'] = { turns: 3, usd: 0.5, tokens: 1200 }
    await tick()
    res = await r.ev.result(out.evalId)
    expect(res.finished).toBe(true)
    expect(res.withPack).toMatchObject({ turns: 2, costUsd: 0.4, tokens: 900, files: 2 })
    expect(res.comparison.comparable).toBe(true)
    expect(res.comparison.verdict).toMatch(/cheaper/)
  })

  it('stops a side that reaches the turn cap and flags it', async () => {
    const r = rig({ busyFor: { 's-with': true, 's-without': false } })
    r.usage['s-with'] = { turns: 5, usd: 1, tokens: 10 }
    const out = await r.ev.start('evalpack', r.root, 'p', 'claude-sonnet-5-5', 5)
    await tick(60)
    const res = await r.ev.result(out.evalId)
    expect(res.withPack.capped).toBe(true)
    expect(res.comparison.flags.join()).toMatch(/turn cap/)
  })

  it('a prompt that was not sent makes the run failed, not silently empty', async () => {
    const r = rig({ sendOk: false })
    const out = await r.ev.start('evalpack', r.root, 'p', 'claude-sonnet-5-5', 30)
    await tick()
    const res = await r.ev.result(out.evalId)
    expect(res.comparison.comparable).toBe(false)
    expect(res.errors.length).toBe(2)
  })

  it('discard drops both worktrees, forgets them and removes the pack record from the worktree', async () => {
    const r = rig()
    const out = await r.ev.start('evalpack', r.root, 'p', 'claude-sonnet-5-5', 30)
    const withPath = r.remembered[0]!.path
    const d = await r.ev.discard(out.evalId)
    expect(d).toEqual({ ok: true, panels: ['s-with', 's-without'] })
    expect(r.dropped.sort()).toEqual(r.remembered.map((w) => w.path).sort())
    expect(r.forgot.length).toBe(2)
    expect(r.packs.installed(withPath).installs).toHaveLength(0)
    expect(r.ev.has(out.evalId)).toBe(false)
    expect(await r.ev.discard(out.evalId)).toEqual({ ok: false, panels: [] })
    await expect(r.ev.result(out.evalId)).rejects.toThrow(/No such eval/)
  })

  it('takes both worktrees down when the setup fails', async () => {
    const r = rig()
    await expect(r.ev.start('no-such-pack', r.root, 'p', 'claude-sonnet-5-5', 30)).rejects.toThrow(/not in the catalog/)
    expect(r.remembered).toEqual([])
  })
})
