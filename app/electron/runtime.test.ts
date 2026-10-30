import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Hub } from './hub.js'
import { PanelRuntime, timeoutOf, WAIT_EXIT } from './runtime.js'
import { runWait, stateOf, type WaitDeps } from './waittools.js'

const mk = () => {
  let t = 1000
  const seen: string[] = []
  const rt = new PanelRuntime({ now: () => ++t, onState: (v) => seen.push(`${v.panel}:${v.state}`) })
  const hub = new Hub()
  const list = [
    { panel: 's1', name: 'api' },
    { panel: 's2', name: 'web' },
  ]
  for (const n of list) {
    rt.open(n.panel)
    hub.add(n.panel, { label: n.name, cwd: '/x', busy: () => false, ask: async () => '' })
  }
  const deps: WaitDeps = { rt, hub, names: () => list }
  return { rt, hub, deps, seen }
}

describe('PanelRuntime state', () => {
  it('follows a turn and an approval', () => {
    const { rt } = mk()
    rt.signal('s1', { kind: 'prompt' })
    expect(rt.view('s1')?.state).toBe('working')
    rt.event('s1', { kind: 'permission', id: 'p1' } as never)
    expect(rt.view('s1')).toMatchObject({ state: 'waiting_approval', pending: 1 })
    expect(rt.needsYou()).toBe(1)
    rt.approvalDone('s1', 'p1')
    expect(rt.view('s1')?.state).toBe('working')
    rt.event('s1', { kind: 'turn', text: 'Done.' })
    expect(rt.view('s1')).toMatchObject({ state: 'idle', turn: 1 })
  })
  it('a question at the end of a turn waits for input; an error turn is an error', () => {
    const { rt } = mk()
    rt.signal('s1', { kind: 'prompt' })
    rt.event('s1', { kind: 'turn', text: 'Which one?' })
    expect(rt.view('s1')?.state).toBe('waiting_input')
    rt.signal('s1', { kind: 'prompt' })
    rt.event('s1', { kind: 'turn', isError: true, text: 'boom' })
    expect(rt.view('s1')).toMatchObject({ state: 'error', reason: 'boom' })
  })
  it('live counts working and waiting-for-approval panels only', () => {
    const { rt } = mk()
    expect(rt.live()).toBe(0)
    rt.signal('s1', { kind: 'prompt' })
    rt.signal('s2', { kind: 'prompt' })
    rt.event('s2', { kind: 'turn', text: 'ok' })
    expect(rt.live()).toBe(1)
  })
  it('keeps events for replay in order, within the caps', () => {
    const rt = new PanelRuntime({ maxEvents: 3 })
    rt.open('s1')
    for (let i = 0; i < 5; i++) rt.event('s1', { kind: 'delta', text: String(i) })
    const snap = rt.snapshot()
    expect(snap.panels[0]!.log).toHaveLength(3)
    expect((snap.panels[0]!.log as { text: string }[]).map((e) => e.text)).toEqual(['2', '3', '4'])
  })
  it('notifies on change only', () => {
    const { rt, seen } = mk()
    rt.signal('s1', { kind: 'prompt' })
    rt.event('s1', { kind: 'delta', text: 'a' })
    rt.event('s1', { kind: 'delta', text: 'b' })
    expect(seen).toEqual(['s1:working'])
  })
  it('resolves a panel by id or by unique name', () => {
    const { rt, deps } = mk()
    expect(rt.resolve('s2', deps.names)).toBe('s2')
    expect(rt.resolve('API', deps.names)).toBe('s1')
    expect(rt.resolve('nope', deps.names)).toBeNull()
  })
})

describe('timeoutOf', () => {
  it('accepts 90s, 10m, plain seconds and caps at 24h', () => {
    expect(timeoutOf('90s')).toBe(90)
    expect(timeoutOf('10m')).toBe(600)
    expect(timeoutOf('30')).toBe(30)
    expect(timeoutOf(undefined)).toBe(600)
    expect(timeoutOf('99h')).toBe(86_400)
    expect(() => timeoutOf('soon')).toThrow(/timeout/)
    expect(() => timeoutOf(-1)).toThrow()
  })
})

describe('stm wait exit codes', () => {
  it('0: blocked is met at once when already blocked', async () => {
    const { rt, deps } = mk()
    rt.signal('s1', { kind: 'prompt' })
    rt.event('s1', { kind: 'turn', isError: true, text: 'x' })
    const r = await runWait(deps, { panel: 's1', for: 'blocked' })
    expect(r).toMatchObject({ code: WAIT_EXIT.met, met: true, state: 'error' })
  })
  it('0: done waits for a turn that ends after the wait began', async () => {
    const { rt, deps } = mk()
    const p = runWait(deps, { panel: 'api', for: 'done' })
    let settled = false
    void p.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    rt.signal('s1', { kind: 'prompt' })
    rt.event('s1', { kind: 'turn', text: 'ok' })
    expect(await p).toMatchObject({ code: 0, met: true, state: 'idle' })
  })
  it('2: timeout', async () => {
    vi.useFakeTimers()
    try {
      const { rt, deps } = mk()
      rt.signal('s1', { kind: 'prompt' })
      const p = runWait(deps, { panel: 's1', for: 'idle', timeout: '5s' })
      await vi.advanceTimersByTimeAsync(5001)
      expect(await p).toMatchObject({ code: WAIT_EXIT.timeout, met: false, state: 'working' })
    } finally {
      vi.useRealTimers()
    }
  })
  it('3: the panel closes while idle is awaited', async () => {
    const { rt, deps } = mk()
    rt.signal('s1', { kind: 'prompt' })
    const p = runWait(deps, { panel: 's1', for: 'idle' })
    rt.close('s1')
    expect(await p).toMatchObject({ code: WAIT_EXIT.closed, met: false, state: 'closed' })
  })
  it('0: a closed panel meets done', async () => {
    const { rt, deps } = mk()
    rt.signal('s1', { kind: 'prompt' })
    const p = runWait(deps, { panel: 's1', for: 'done' })
    rt.close('s1')
    expect(await p).toMatchObject({ code: 0, met: true })
  })
  it('4: A waits on B, then B waiting on A is refused', async () => {
    const { rt, deps } = mk()
    rt.signal('s1', { kind: 'prompt' })
    rt.signal('s2', { kind: 'prompt' })
    const a = runWait(deps, { from: 's1', panel: 's2', for: 'idle' })
    const b = await runWait(deps, { from: 's2', panel: 's1', for: 'idle' })
    expect(b).toMatchObject({ code: WAIT_EXIT.cycle, met: false })
    expect(b.error).toMatch(/deadlock/)
    rt.event('s2', { kind: 'turn', text: 'ok' })
    expect(await a).toMatchObject({ code: 0 })
    // the edge is gone once the wait ends
    rt.signal('s1', { kind: 'prompt' })
    const c = runWait(deps, { from: 's2', panel: 's1', for: 'done' })
    rt.event('s1', { kind: 'turn', text: 'ok' })
    expect((await c).code).toBe(0)
  })
  it('4: a panel cannot wait on itself', async () => {
    const { deps } = mk()
    expect((await runWait(deps, { from: 's1', panel: 's1', for: 'idle' })).code).toBe(WAIT_EXIT.cycle)
  })
  it('1: unknown panel and bad arguments throw', async () => {
    const { deps } = mk()
    await expect(runWait(deps, { panel: 'zz', for: 'idle' })).rejects.toThrow(/No panel/)
    await expect(runWait(deps, { panel: 's1', for: 'later' })).rejects.toThrow(/--for/)
    await expect(runWait(deps, { panel: 's1', for: 'idle', timeout: 'soon' })).rejects.toThrow(/timeout/)
  })
  it('stm state: one panel or all', () => {
    const { rt, deps } = mk()
    rt.signal('s1', { kind: 'prompt' })
    expect(stateOf(deps, 'api')).toMatchObject({ panel: 's1', name: 'api', state: 'working' })
    expect((stateOf(deps) as unknown[]).length).toBe(2)
    expect(() => stateOf(deps, 'zz')).toThrow(/No panel/)
  })
})

describe('wiring in main.ts', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
  it('keep running is off unless the setting is on, and macOS only', () => {
    expect(main).toMatch(/const keepRunningOn = \(\) => process\.platform === 'darwin' && settings\(\)\.keepRunning === true/)
  })
  it('stm wait and stm state are CLI handlers; the panel tools are allowed', () => {
    expect(main).toMatch(/wait: \(a\) => runWait\(waitDeps/)
    expect(main).toMatch(/state: \(a\) => stateOf\(waitDeps/)
    expect(main).toContain('TOOLS[2]!, TOOLS[3]!')
  })
  it('does not add a network call', () => {
    const mine = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8') + readFileSync(new URL('./waittools.ts', import.meta.url), 'utf8') + readFileSync(new URL('./tray.ts', import.meta.url), 'utf8') + readFileSync(new URL('./runmarker.ts', import.meta.url), 'utf8')
    expect(mine).not.toMatch(/https?:\/\/|net\.fetch|node:https?|node:net'|fetch\(/)
  })
})
