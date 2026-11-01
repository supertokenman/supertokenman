import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decide } from '../shared/autonomy'
import { gate, PanelControl, pilotGate, PolicyStore, type Existing, type PilotCall } from './policy'

let root = ''
const mk = () => (root = mkdtempSync(join(tmpdir(), 'stm-pol-')))
afterEach(() => root && rmSync(root, { recursive: true, force: true }))

const setup = (global = '', project = '') => {
  mk()
  mkdirSync(join(root, 'policy'))
  mkdirSync(join(root, 'proj', '.stm'), { recursive: true })
  if (global) writeFileSync(join(root, 'policy', 'global.rules'), global)
  if (project) writeFileSync(join(root, 'proj', '.stm', 'policy.rules'), project)
  const store = new PolicyStore(join(root, 'policy', 'global.rules'))
  const proj = join(root, 'proj')
  return { store, proj, ctx: { project: proj, home: '/home/u', cwd: proj } }
}
const ask: Existing = { action: 'ask', risk: null }
const allow: Existing = { action: 'allow', risk: null }

describe('gate', () => {
  it('with no rules files nothing changes: the existing answer comes back', () => {
    const { store, proj, ctx } = setup()
    for (const e of [ask, allow, { action: 'deny' as const, risk: null }]) {
      expect(gate('Bash', { command: 'ls' }, e, { store, root: proj, ctx }).action).toBe(e.action)
    }
  })
  it('a hard deny of the app is not looked at by any rule, even an allow', () => {
    const { store, proj, ctx } = setup('allow *\n')
    const r = gate('Bash', { command: 'ls' }, { action: 'deny', risk: null, reason: 'held' }, { store, root: proj, ctx })
    expect(r).toMatchObject({ action: 'deny', by: 'app', reason: 'held' })
  })
  it('deny and ask rules tighten; ask never loosens a deny', () => {
    const { store, proj, ctx } = setup('deny Bash when cmd matches "rm -rf *" -- no\nask network\n')
    expect(gate('Bash', { command: 'rm -rf /tmp/x' }, allow, { store, root: proj, ctx })).toMatchObject({ action: 'deny', by: 'rule', rule: 'global:1 no' })
    expect(gate('WebFetch', { url: 'https://example.com' }, allow, { store, root: proj, ctx })).toMatchObject({ action: 'ask', by: 'rule' })
  })
  it('an explicit allow turns an ask into allow, a project allow cannot beat a global ask', () => {
    const { store, proj, ctx } = setup('ask network\n', 'allow read when path inside $project\nallow WebFetch\n')
    expect(gate('Read', { file_path: `${proj}/a.ts` }, ask, { store, root: proj, ctx })).toMatchObject({ action: 'allow', by: 'rule' })
    expect(gate('WebFetch', { url: 'https://example.com' }, ask, { store, root: proj, ctx }).action).toBe('ask')
  })
  it('rules files with bad lines: the valid lines apply, the bad ones are dropped and report their line', () => {
    const { store, proj, ctx } = setup('this is nonsense\nask Bash\n')
    expect(store.loadGlobal().errors.map((e) => e.line)).toEqual([1])
    expect(gate('Bash', { command: 'ls' }, allow, { store, root: proj, ctx }).action).toBe('ask')
  })
  it('a file that cannot be read adds no rules and loosens nothing', () => {
    const { store, proj, ctx } = setup()
    mkdirSync(join(root, 'policy', 'global.rules'))
    expect(store.loadGlobal().unreadable).toBeTruthy()
    expect(gate('Bash', { command: 'ls' }, ask, { store, root: proj, ctx }).action).toBe('ask')
  })
  it('picks up a changed file', () => {
    const { store, proj, ctx } = setup()
    expect(gate('Bash', { command: 'ls' }, allow, { store, root: proj, ctx, now: 1000 }).action).toBe('allow')
    writeFileSync(join(proj, '.stm', 'policy.rules'), 'ask Bash\n')
    expect(gate('Bash', { command: 'ls' }, allow, { store, root: proj, ctx, now: 5000 }).action).toBe('ask')
  })
  it('a panel writing the rules file asks, even with allow *', () => {
    const { store, proj, ctx } = setup('allow *\n')
    expect(gate('Write', { file_path: `${proj}/.stm/policy.rules` }, ask, { store, root: proj, ctx }).action).toBe('ask')
    expect(gate('Bash', { command: 'echo x >> .stm/policy.rules' }, ask, { store, root: proj, ctx }).action).toBe('ask')
    expect(gate('Write', { file_path: `${proj}/src/a.ts` }, ask, { store, root: proj, ctx }).action).toBe('allow')
  })
  it('the real decide: an ask for a risky command is not loosened by a read allow', () => {
    const { store, proj, ctx } = setup('allow read\n')
    const e = decide('supervised', 'Bash', { command: 'npm install left-pad' })
    expect(gate('Bash', { command: 'npm install left-pad' }, e, { store, root: proj, ctx }).action).toBe(e.action)
  })
  it('agent and panel caps: the next one past the cap asks, not denies', () => {
    const { store, proj, ctx } = setup()
    const c = new PanelControl()
    c.agentCap = 2
    c.fanoutCap = 1
    const o = { store, root: proj, ctx, control: c }
    expect(gate('Task', {}, allow, o).action).toBe('allow')
    expect(gate('Task', {}, allow, o).action).toBe('allow')
    expect(gate('Task', {}, allow, o)).toMatchObject({ action: 'ask', by: 'app' })
    expect(gate('mcp__stm__delegate', {}, allow, o).action).toBe('allow')
    expect(gate('mcp__stm__delegate', {}, allow, o).action).toBe('ask')
    c.runStart()
    expect(gate('Task', {}, allow, o).action).toBe('allow')
  })
  it('breakpoints: before a tool asks, after the plan holds the next call once, unattended denies', () => {
    const { store, proj, ctx } = setup()
    const c = new PanelControl()
    c.breakpoints = [{ kind: 'before', tool: 'Bash' }, { kind: 'afterPlan' }]
    c.planLines = ['write tests']
    const o = { store, root: proj, ctx, control: c }
    expect(gate('Bash', { command: 'ls' }, allow, o)).toMatchObject({ action: 'ask', bp: 'before', why: 'Breakpoint: before Bash' })
    expect(gate('Read', { file_path: '/x' }, allow, o).action).toBe('allow')
    expect(gate('TodoWrite', {}, allow, o).action).toBe('allow')
    expect(gate('Read', { file_path: '/x' }, allow, o)).toMatchObject({ action: 'ask', bp: 'afterPlan' })
    expect(gate('Read', { file_path: '/y' }, allow, o).action).toBe('allow')
    expect(gate('Bash', { command: 'ls' }, allow, { ...o, unattended: true }).action).toBe('deny')
    expect(gate('Bash', { command: 'ls' }, { action: 'deny', risk: null }, o).bp).toBeUndefined()
  })
})

describe('pilotGate (app_run)', () => {
  const call = (o: Partial<PilotCall> = {}): PilotCall => ({ id: 'go-today', specId: 'go-today', args: {}, tier: 'free', tainted: false, pilot: true, everywhere: false, ...o })
  it('a free command is allowed with no rules', () => {
    const { store, proj, ctx } = setup()
    expect(pilotGate(call(), { store, root: proj, ctx }).action).toBe('allow')
  })
  it('an ask command asks with no rules, and a clean allow rule on app_run:<id> lets it run', () => {
    const { store, proj, ctx } = setup('allow app_run:go-x\n')
    expect(pilotGate(call({ id: 'go-y', specId: 'go-y', tier: 'ask' }), { store, root: proj, ctx }).action).toBe('ask')
    expect(pilotGate(call({ id: 'go-x', specId: 'go-x', tier: 'ask' }), { store, root: proj, ctx })).toMatchObject({ action: 'allow', by: 'rule' })
  })
  it('a rule on the tool with arg.id works too', () => {
    const { store, proj, ctx } = setup('allow mcp__stm__app_run when arg.id is go-x\n')
    expect(pilotGate(call({ id: 'go-x', specId: 'go-x', tier: 'ask' }), { store, root: proj, ctx }).action).toBe('allow')
    expect(pilotGate(call({ id: 'go-z', specId: 'go-z', tier: 'ask' }), { store, root: proj, ctx }).action).toBe('ask')
  })
  it('a tainted session never allows an ask command, even with a matching allow rule', () => {
    const { store, proj, ctx } = setup('allow app_run:go-x\nallow mcp__stm__app_run\nallow *\n')
    const r = pilotGate(call({ id: 'go-x', specId: 'go-x', tier: 'ask', tainted: true }), { store, root: proj, ctx })
    expect(r.action).toBe('ask')
  })
  it('confirm always asks: no rule allows it', () => {
    const { store, proj, ctx } = setup('allow *\nallow app_run:go-x\n')
    expect(pilotGate(call({ id: 'go-x', specId: 'go-x', tier: 'confirm' }), { store, root: proj, ctx }).action).toBe('ask')
  })
  it('a deny rule or an ask rule tightens, even for a free command', () => {
    const { store, proj, ctx } = setup('deny app_run:go-a\nask app_run:go-b\nallow app_run:go-b\n')
    expect(pilotGate(call({ id: 'go-a', specId: 'go-a' }), { store, root: proj, ctx })).toMatchObject({ action: 'deny', by: 'rule' })
    expect(pilotGate(call({ id: 'go-b', specId: 'go-b' }), { store, root: proj, ctx }).action).toBe('ask')
    expect(pilotGate(call({ id: 'go-b', specId: 'go-b', tier: 'ask' }), { store, root: proj, ctx }).action).toBe('ask')
  })
  it('a panel that is not the Pilot: confirm is refused, ask is refused unless pilotEverywhere and then always a card', () => {
    const { store, proj, ctx } = setup('allow *\n')
    const o = { store, root: proj, ctx }
    expect(pilotGate(call({ pilot: false, tier: 'confirm' }), o).action).toBe('deny')
    expect(pilotGate(call({ pilot: false, tier: 'ask' }), o).action).toBe('deny')
    expect(pilotGate(call({ pilot: false, tier: 'ask', everywhere: true }), o).action).toBe('ask')
    expect(pilotGate(call({ pilot: false, tier: 'free' }), o).action).toBe('allow')
  })
  it('a breakpoint before the tool still pauses a free command', () => {
    const { store, proj, ctx } = setup()
    const control = new PanelControl()
    control.breakpoints = [{ kind: 'before', tool: 'mcp__stm__app_run' }]
    expect(pilotGate(call(), { store, root: proj, ctx, control })).toMatchObject({ action: 'ask', bp: 'before' })
  })
})
