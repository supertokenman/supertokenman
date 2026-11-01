import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPilotRate } from '../shared/pilotrate'
import { AuditLog } from './audit'
import { PanelControl, PolicyStore } from './policy'
import { callKey, cardText, parseRun, PILOT_READ_TOOLS, PILOT_TIMEOUT_MS, PilotHub, PilotLink, pilotTools, visibleTo, type PilotDeps, type Who } from './pilottools'

let root = ''
afterEach(() => {
  vi.useRealTimers()
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

function setup(rules = '') {
  root = mkdtempSync(join(tmpdir(), 'stm-pilot-'))
  mkdirSync(join(root, 'policy'))
  if (rules) writeFileSync(join(root, 'policy', 'global.rules'), rules)
  const store = new PolicyStore(join(root, 'policy', 'global.rules'))
  const audit = new AuditLog(join(root, 'audit'))
  let t = 1_000_000
  const clock = { now: () => t, tick: (ms: number) => (t += ms) }
  const control = new PanelControl()
  const changed = vi.fn()
  const hub = new PilotHub(createPilotRate(clock.now), audit, () => ({ store, root: join(root, 'proj'), ctx: { project: join(root, 'proj'), home: '/home/u', cwd: join(root, 'proj') }, control }), clock.now, changed)
  const rows = () => audit.query({ from: 0, to: Date.now() + 86_400_000 })
  return { hub, rows, clock, changed, control }
}
const who = (o: Partial<Who> = {}): Who => ({ sid: 's1', pilot: true, everywhere: false, tainted: false, project: 'proj', turn: 1, ...o })

describe('parseRun', () => {
  it('resolves ids, families and literal family ids, with the tier from the spec', () => {
    expect(parseRun({ id: 'go-today' })).toMatchObject({ ok: true, wire: 'go-today', tier: 'free' })
    expect(parseRun({ id: 'layout-grid' })).toMatchObject({ ok: true, wire: 'layout-grid', args: { id: 'grid' } })
    expect(parseRun({ id: 'layout-<id>', args: { id: 'columns' } })).toMatchObject({ ok: true, wire: 'layout-columns', args: { id: 'columns' } })
    expect(parseRun({ id: 'open-<cwd>', args: { cwd: '/repo' } })).toMatchObject({ ok: true, tier: 'ask', wire: 'open-/repo' })
  })
  it('refuses ids not in the catalog (policy files, tier tables), commands for the person, bad args', () => {
    for (const id of ['policy', 'policy.rules', 'tier', '../policy/global.rules', 'set-tier', '']) expect(parseRun({ id })).toMatchObject({ ok: false })
    expect(parseRun({ id: 'go-worktree' })).toMatchObject({ ok: false })
    expect(parseRun({ id: 'worktree' })).toMatchObject({ ok: false })
    expect(parseRun({ id: 'layout-zig' })).toMatchObject({ ok: false })
    expect(parseRun({ id: 'go-today', args: { extra: 1 } })).toMatchObject({ ok: false })
    expect(parseRun({ id: 'go-today', args: [] })).toMatchObject({ ok: false })
    expect(parseRun({ id: 'layout-grid', args: { id: 'columns' } })).toMatchObject({ ok: false })
  })
  it('card text names the command, args and tier', () => {
    const p = parseRun({ id: 'open-<cwd>', args: { cwd: '/repo' } })
    if (!p.ok) throw new Error('parse')
    expect(cardText(p)).toBe('Pilot: Open a panel in a recent folder (cwd=/repo) [ask]')
    expect(callKey('a', { b: 1, a: 2 })).toBe(callKey('a', { a: 2, b: 1 }))
  })
})

describe('PilotLink', () => {
  it('settles a call with the window answer and ignores a late or unknown one', async () => {
    const sent: { callId: string }[] = []
    const link = new PilotLink((p) => (sent.push(p), true))
    const call = link.call({ id: 'go-today', args: {} })
    expect(link.settle(sent[0]!.callId, { ok: true, text: 'opened' })).toBe(true)
    expect(await call).toEqual({ ok: true, text: 'opened' })
    expect(link.settle(sent[0]!.callId, { ok: true, text: 'again' })).toBe(false)
    expect(link.settle('nope', { ok: true, text: '' })).toBe(false)
  })
  it('times out after 10 seconds with an error result, and a late answer is dropped', async () => {
    vi.useFakeTimers()
    const sent: { callId: string }[] = []
    const link = new PilotLink((p) => (sent.push(p), true))
    const call = link.call({ id: 'go-today', args: {} })
    await vi.advanceTimersByTimeAsync(PILOT_TIMEOUT_MS - 1)
    expect(link.settle('x', { ok: true, text: '' })).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    const r = await call
    expect(r.ok).toBe(false)
    expect(r.text).toMatch(/did not answer in 10 seconds/)
    expect(link.settle(sent[0]!.callId, { ok: true, text: 'late' })).toBe(false)
  })
  it('answers at once when the window is gone', async () => {
    const link = new PilotLink(() => false)
    expect(await link.call({ id: 'go-today', args: {} })).toMatchObject({ ok: false, text: 'The app window is closed.' })
  })
})

describe('PilotHub.decide: tiers, taint, rate limit, audit', () => {
  it('free runs and writes a pilot row with the tier and the taint flag', () => {
    const { hub, rows } = setup()
    const v = hub.decide({ id: 'go-today' }, who())
    expect(v.action).toBe('allow')
    expect(rows()).toMatchObject([{ by: 'pilot', tool: 'mcp__stm__app_run', tier: 'free', decision: 'allow', tainted: false, panel: 's1' }])
  })
  it('ask shows a card; an allow rule runs it only in a clean Pilot session', () => {
    const { hub, rows } = setup('allow app_run:open-<cwd>\n')
    const input = { id: 'open-<cwd>', args: { cwd: '/repo' } }
    expect(hub.decide({ id: 'open-<cwd>', args: { cwd: '/repo' } }, who()).action).toBe('allow')
    expect(hub.decide(input, who({ tainted: true })).action).toBe('ask')
    expect(hub.decide(input, who({ pilot: false, everywhere: true })).action).toBe('ask')
    expect(rows().map((r) => [r.decision, r.tainted])).toEqual(expect.arrayContaining([['allow', false], ['ask', true], ['ask', false]]))
  })
  it('without a rule an ask command asks, and taint makes no difference', () => {
    const { hub } = setup()
    expect(hub.decide({ id: 'open-<cwd>', args: { cwd: '/repo' } }, who()).action).toBe('ask')
    expect(hub.decide({ id: 'open-<cwd>', args: { cwd: '/repo' } }, who({ tainted: true })).action).toBe('ask')
  })
  it('ordinary panels: free only; ask needs pilotEverywhere and then asks; no rule can say otherwise', () => {
    const { hub } = setup('allow *\nallow app_run:open-<cwd>\n')
    const ask = { id: 'open-<cwd>', args: { cwd: '/repo' } }
    expect(hub.decide({ id: 'go-today' }, who({ pilot: false })).action).toBe('allow')
    expect(hub.decide(ask, who({ pilot: false })).action).toBe('deny')
    expect(hub.decide(ask, who({ pilot: false, everywhere: true })).action).toBe('ask')
  })
  it('unknown ids and commands for the person are refused and audited', () => {
    const { hub, rows } = setup('allow *\n')
    expect(hub.decide({ id: 'policy.rules' }, who())).toMatchObject({ action: 'deny' })
    expect(hub.decide({ id: 'go-worktree' }, who())).toMatchObject({ action: 'deny' })
    expect(rows().filter((r) => r.decision === 'deny' && r.by === 'pilot')).toHaveLength(2)
  })
  it('a deny rule refuses a free command', () => {
    const { hub } = setup('deny app_run:go-today\n')
    expect(hub.decide({ id: 'go-today' }, who())).toMatchObject({ action: 'deny' })
  })
  it('rate limit: burst 10 free actions, then an error text instead of a card; ask counts double', () => {
    const { hub, clock } = setup()
    for (let i = 0; i < 10; i++) expect(hub.decide({ id: 'go-today' }, who()).action).toBe('allow')
    const over = hub.decide({ id: 'go-today' }, who())
    expect(over.action).toBe('deny')
    expect(over.message).toMatch(/rate limit/i)
    // another panel has its own bucket
    expect(hub.decide({ id: 'go-today' }, who({ sid: 's2' })).action).toBe('allow')
    clock.tick(2000)
    expect(hub.decide({ id: 'go-today' }, who()).action).toBe('allow')
    // 5 ask commands are the burst
    for (let i = 0; i < 5; i++) expect(hub.decide({ id: 'open-<cwd>', args: { cwd: '/r' } }, who({ sid: 's3' })).action).toBe('ask')
    expect(hub.decide({ id: 'open-<cwd>', args: { cwd: '/r' } }, who({ sid: 's3' })).action).toBe('deny')
  })
  it('a call over the limit is audited as a deny', () => {
    const { hub, rows } = setup()
    for (let i = 0; i < 11; i++) hub.decide({ id: 'go-today' }, who())
    expect(rows().filter((r) => r.decision === 'deny')).toHaveLength(1)
  })
  it('a breakpoint before app_run turns an allowed command into a card', () => {
    const { hub, control } = setup()
    control.breakpoints = [{ kind: 'before', tool: 'mcp__stm__app_run' }]
    expect(hub.decide({ id: 'go-today' }, who()).action).toBe('ask')
  })
})

describe('PilotHub grants', () => {
  it('an approval is used once, for that exact call, and expires', () => {
    const { hub, clock } = setup()
    const p = { id: 'open-/r', args: { cwd: '/r' } }
    hub.grantInput('s1', { id: 'open-<cwd>', args: { cwd: '/r' } })
    expect(hub.take('s2', p)).toBe(false)
    expect(hub.take('s1', p)).toBe(false)
    hub.grant('s1', p)
    expect(hub.take('s1', { id: 'open-/r', args: { cwd: '/other' } })).toBe(false)
    expect(hub.take('s1', p)).toBe(true)
    expect(hub.take('s1', p)).toBe(false)
    hub.grant('s1', p)
    clock.tick(31_000)
    expect(hub.take('s1', p)).toBe(false)
  })
})

describe('PilotHub undo', () => {
  const parsed = (id: string, args?: Record<string, unknown>) => {
    const p = parseRun({ id, args })
    if (!p.ok) throw new Error(p.error)
    return p
  }
  it('records an action with its inverse and lists it newest first, capped at 100', () => {
    const { hub, changed } = setup()
    const a = hub.record(parsed('layout-grid'), 's1', { ok: true, text: 'ok', undo: { kind: 'layout', prev: 'auto' }, after: 'grid' })
    expect(a.undo).toEqual({ kind: 'layout', prev: 'auto' })
    expect(changed).toHaveBeenCalled()
    hub.record(parsed('go-today'), 's1', { ok: true, text: 'ok' })
    expect(hub.actions().map((x) => [x.command, x.undo])).toEqual([['go-today', null], ['layout-grid', 'layout']])
    for (let i = 0; i < 120; i++) hub.record(parsed('go-today'), 's1', { ok: true, text: 'ok' })
    expect(hub.actions()).toHaveLength(100)
  })
  it('ignores an inverse of the wrong kind and one that would restore a widening setting', () => {
    const { hub } = setup()
    expect(hub.record(parsed('layout-grid'), 's1', { ok: true, text: '', undo: { kind: 'routine', id: 'r', prevEnabled: true } }).undo).toBeNull()
    expect(hub.record(parsed('go-private'), 's1', { ok: true, text: '', undo: { kind: 'setting', key: 'fullTools', prev: true } }).undo).toBeNull()
    expect(hub.record(parsed('go-private'), 's1', { ok: true, text: '', undo: { kind: 'setting', key: 'private', prev: false }, after: true }).undo).toEqual({ kind: 'setting', key: 'private', prev: false })
  })
  it('undo runs the inverse without asking, removes the action, and is refused when changed since', async () => {
    const { hub } = setup()
    const sent: { callId: string; id: string; undo?: unknown }[] = []
    let link!: PilotLink
    link = new PilotLink((p) => (sent.push(p), queueMicrotask(() => link.settle(p.callId, { ok: true, text: 'undone' })), true))
    const a = hub.record(parsed('layout-grid'), 's1', { ok: true, text: '', undo: { kind: 'layout', prev: 'auto' }, after: 'grid' })
    // the person moved the layout since
    expect(await hub.runUndo(a.id, { link, current: async () => 'columns' })).toEqual({ ok: false, reason: 'changed' })
    expect(sent).toHaveLength(0)
    expect(await hub.runUndo(a.id, { link, current: async () => 'grid' })).toEqual({ ok: true })
    expect(sent[0]).toMatchObject({ id: 'undo', undo: { kind: 'layout', prev: 'auto' } })
    expect(hub.actions()).toHaveLength(0)
    expect(await hub.runUndo(a.id, { link, current: async () => 'grid' })).toEqual({ ok: false, reason: 'missing' })
  })
  it('an irreversible command is listed as such and cannot be undone', async () => {
    const { hub } = setup()
    const spec = parsed('go-today')
    const a = hub.record({ ...spec, spec: { ...spec.spec, effect: 'irreversible', undo: 'layout' } }, 's1', { ok: true, text: '', undo: { kind: 'layout', prev: 'auto' } })
    expect(hub.actions()[0]).toMatchObject({ irreversible: true, undo: null })
    const link = new PilotLink(() => true)
    expect(await hub.runUndo(a.id, { link, current: async () => undefined })).toEqual({ ok: false, reason: 'irreversible' })
  })
  it('a failed undo keeps the action', async () => {
    const { hub } = setup()
    let link!: PilotLink
    link = new PilotLink((p) => (queueMicrotask(() => link.settle(p.callId, { ok: false, text: 'no' })), true))
    const a = hub.record(parsed('layout-grid'), 's1', { ok: true, text: '', undo: { kind: 'layout', prev: 'auto' } })
    expect(await hub.runUndo(a.id, { link, current: async () => 'grid' })).toEqual({ ok: false, reason: 'failed' })
    expect(hub.actions()).toHaveLength(1)
  })
  it('recordLayout lists a layout change made by ui_set_layout, with undo', () => {
    const { hub } = setup()
    hub.recordLayout('s1', 'auto', 'canvas')
    expect(hub.actions()[0]).toMatchObject({ command: 'layout-canvas', undo: 'layout' })
  })
})

function deps(o: { rules?: string; who?: Partial<Who>; answer?: boolean; run?: (id: string, args: Record<string, unknown>) => { ok: boolean; text: string; undo?: never } } = {}) {
  const env = setup(o.rules)
  const asked: string[] = []
  const ran: { id: string; args: Record<string, unknown> }[] = []
  let link!: PilotLink
  link = new PilotLink((p) => {
    ran.push({ id: p.id, args: p.args })
    queueMicrotask(() => link.settle(p.callId, o.run ? o.run(p.id, p.args) : { ok: true, text: `ran ${p.id}`, ...(p.id.startsWith('layout-') ? { undo: { kind: 'layout' as const, prev: 'auto' }, after: 'grid' } : {}) }))
    return true
  })
  const d: PilotDeps = {
    me: 's1',
    hub: env.hub,
    link,
    who: () => who(o.who),
    ask: async (summary) => (asked.push(summary), o.answer === true),
    reads: {
      state: async () => 'Layout: auto. 1 panel',
      settings: () => ({ all: { hotkey: 'X', smallModel: 'm', GITHUB_TOKEN: 'ghp_secret', voiceId: 'v' }, vaultBacked: ['voiceId'] }),
      cost: () => 'Today: $0.00',
      routines: () => 'none',
      packs: () => 'none',
      notifications: (n) => `last ${n}`,
    },
    log: () => undefined,
  }
  const tools = pilotTools(d)
  const call = async (name: string, args: Record<string, unknown>) => {
    const t = tools.find((x) => x.name === name)!
    const r = (await (t.handler as unknown as (a: object, x: object) => Promise<{ content: { text: string }[]; isError?: boolean }>)(args, {}))
    return { text: r.content[0]!.text, isError: Boolean(r.isError) }
  }
  return { ...env, d, call, asked, ran }
}

describe('pilotTools', () => {
  it('has the three generic tools and the read tools, and the read tools are all pre-approved names', () => {
    const { d } = deps()
    expect(pilotTools(d).map((t) => t.name).sort()).toEqual(['app_commands', 'app_cost', 'app_describe', 'app_notifications', 'app_packs', 'app_routines', 'app_run', 'app_settings', 'app_state'])
    expect(PILOT_READ_TOOLS).toHaveLength(8)
    expect(PILOT_READ_TOOLS.every((n) => n.startsWith('mcp__stm__app_') && n !== 'mcp__stm__app_run')).toBe(true)
  })
  it('app_commands lists what the panel may run: everything in the Pilot, free commands elsewhere', async () => {
    const pilot = await deps().call('app_commands', {})
    expect(pilot.text).toMatch(/go-today.*\[free\]/)
    expect(pilot.text).toMatch(/open-<cwd>.*\[ask\]/)
    const other = await deps({ who: { pilot: false } }).call('app_commands', {})
    expect(other.text).toMatch(/go-today/)
    expect(other.text).not.toMatch(/\[ask\]/)
    expect(visibleTo({ pilot: false, everywhere: true }).some((c) => c.tier === 'ask')).toBe(true)
    expect(visibleTo({ pilot: true, everywhere: false }).every((c) => c.agent)).toBe(true)
  })
  it('app_describe shows args, tier and undo', async () => {
    const r = await deps().call('app_describe', { id: 'layout-<id>' })
    expect(r.text).toMatch(/Tier: free/)
    expect(r.text).toMatch(/id: auto\|grid/)
    expect(r.text).toMatch(/Undo: layout/)
    expect((await deps().call('app_describe', { id: 'nope' })).isError).toBe(true)
  })
  it('app_run runs a free command through the window and records an undoable action', async () => {
    const { call, ran, hub } = deps()
    const r = await call('app_run', { id: 'layout-grid' })
    expect(r).toMatchObject({ isError: false })
    expect(r.text).toMatch(/ran layout-grid/)
    expect(ran).toEqual([{ id: 'layout-grid', args: { id: 'grid' } }])
    expect(hub.actions()[0]).toMatchObject({ command: 'layout-grid', undo: 'layout' })
  })
  it('app_run for an ask command shows a card (asks), and runs only when the person allows', async () => {
    const no = deps({ answer: false })
    const r = await no.call('app_run', { id: 'open-<cwd>', args: { cwd: '/repo' } })
    expect(r.isError).toBe(true)
    expect(no.ran).toHaveLength(0)
    expect(no.asked[0]).toMatch(/Open a panel in a recent folder/)
    const yes = deps({ answer: true })
    expect((await yes.call('app_run', { id: 'open-<cwd>', args: { cwd: '/repo' } })).isError).toBe(false)
    expect(yes.ran).toEqual([{ id: 'open-/repo', args: { cwd: '/repo' } }])
  })
  it('a call the permission step approved does not ask again; a grant is single use', async () => {
    const t = deps({ answer: false })
    t.hub.grantInput('s1', { id: 'open-<cwd>', args: { cwd: '/repo' } })
    expect((await t.call('app_run', { id: 'open-<cwd>', args: { cwd: '/repo' } })).isError).toBe(false)
    expect(t.asked).toHaveLength(0)
    expect((await t.call('app_run', { id: 'open-<cwd>', args: { cwd: '/repo' } })).isError).toBe(true)
  })
  it('a tainted session asks even with an allow rule; a clean one with the rule does not', async () => {
    const rule = 'allow app_run:open-<cwd>\n'
    const clean = deps({ rules: rule, answer: false })
    expect((await clean.call('app_run', { id: 'open-<cwd>', args: { cwd: '/r' } })).isError).toBe(false)
    expect(clean.asked).toHaveLength(0)
    const dirty = deps({ rules: rule, answer: false, who: { tainted: true } })
    expect((await dirty.call('app_run', { id: 'open-<cwd>', args: { cwd: '/r' } })).isError).toBe(true)
    expect(dirty.asked).toHaveLength(1)
  })
  it('refuses unknown ids, bad args, an ordinary panel past its tier, and over the rate limit', async () => {
    const t = deps()
    expect((await t.call('app_run', { id: 'policy.rules' })).isError).toBe(true)
    expect((await t.call('app_run', { id: 'go-today', args: { x: 1 } })).isError).toBe(true)
    const other = deps({ who: { pilot: false } })
    expect((await other.call('app_run', { id: 'open-<cwd>', args: { cwd: '/r' } })).isError).toBe(true)
    expect(other.ran).toHaveLength(0)
    const lim = deps()
    let last = { text: '', isError: false }
    for (let i = 0; i < 12; i++) last = await lim.call('app_run', { id: 'go-today' })
    expect(last.isError).toBe(true)
    expect(last.text).toMatch(/rate limit/i)
    expect(lim.ran).toHaveLength(10)
  })
  it('a window error or timeout comes back as an error and records nothing', async () => {
    const t = deps({ run: () => ({ ok: false, text: 'The window did not answer in 10 seconds.' }) })
    const r = await t.call('app_run', { id: 'go-today' })
    expect(r.isError).toBe(true)
    expect(t.hub.actions()).toHaveLength(0)
  })
  it('settings go through the allowlist: secret and vault-backed keys are dropped, not masked', async () => {
    const r = await deps().call('app_settings', {})
    expect(r.text).toMatch(/hotkey/)
    expect(r.text).toMatch(/smallModel/)
    expect(r.text).not.toMatch(/ghp_secret|GITHUB_TOKEN|"v"/)
    expect(r.text).toMatch(/Not available: voiceId/)
    const asked = await deps().call('app_settings', { keys: ['GITHUB_TOKEN', 'voiceId'] })
    expect(asked.text).not.toMatch(/ghp_secret/)
    expect(asked.text).toMatch(/Not available: GITHUB_TOKEN, voiceId/)
  })
  it('the read tools return what main gives them', async () => {
    const t = deps()
    expect((await t.call('app_state', {})).text).toBe('Layout: auto. 1 panel')
    expect((await t.call('app_cost', {})).text).toBe('Today: $0.00')
    expect((await t.call('app_notifications', { limit: 3 })).text).toBe('last 3')
  })
})

describe('no vault access', () => {
  it('the tools module never touches the vault, secrets or the settings file', () => {
    const src = readFileSync(new URL('./pilottools.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/vault\.(get|all)|from '\.\/vault|bitwarden|safeStorage|settings\.json|process\.env/i)
  })
})
