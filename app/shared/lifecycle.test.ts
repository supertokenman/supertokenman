import { describe, expect, it } from 'vitest'
import { initialLife, quitMode, reduceLife, type LifeState } from './lifecycle'

const run = (s: LifeState, ...evs: Parameters<typeof reduceLife>[1][]) => {
  let state = s
  let effects: string[] = []
  for (const ev of evs) [state, effects] = reduceLife(state, ev)
  return { state, effects }
}
const live = (keepRunning: boolean, count: number): LifeState => ({ ...initialLife(keepRunning), live: count })

describe('lifecycle', () => {
  it('quits when keepRunning is off, even with live panels', () => {
    expect(quitMode(live(false, 3))).toBe('quit')
    const { state, effects } = run(live(false, 3), { type: 'quit-request', source: 'cmd-q' })
    expect(state.phase).toBe('quitting')
    expect(effects).toEqual(['stop-all', 'write-clean-marker', 'exit'])
  })

  it('quits when keepRunning is on but no panel is live', () => {
    expect(quitMode(live(true, 0))).toBe('quit')
    const { effects } = run(live(true, 0), { type: 'quit-request', source: 'window-close' })
    expect(effects).toContain('exit')
  })

  it('goes to background on close with keepRunning and live panels', () => {
    expect(quitMode(live(true, 1))).toBe('background')
    const { state, effects } = run(live(true, 2), { type: 'quit-request', source: 'window-close' })
    expect(state.phase).toBe('background')
    expect(state.live).toBe(2)
    expect(effects).toEqual(['hide-windows', 'dock-hide', 'show-tray'])
  })

  it('a second close while in background changes nothing', () => {
    const bg = run(live(true, 1), { type: 'quit-request', source: 'cmd-q' }).state
    expect(run(bg, { type: 'quit-request', source: 'cmd-q' }).effects).toEqual([])
  })

  it('reattaches on open and asks for a snapshot', () => {
    const bg = run(live(true, 1), { type: 'quit-request', source: 'cmd-q' }).state
    const { state, effects } = run(bg, { type: 'open' })
    expect(state.phase).toBe('attached')
    expect(effects).toEqual(['dock-show', 'show-window', 'hide-tray', 'request-snapshot'])
  })

  it('Quit and stop all stops panels and quits even in background', () => {
    const bg = run(live(true, 2), { type: 'quit-request', source: 'cmd-q' }).state
    const { state, effects } = run(bg, { type: 'quit-and-stop' })
    expect(state.phase).toBe('quitting')
    expect(effects).toEqual(['stop-all', 'write-clean-marker', 'exit'])
  })

  it('Tray Stop all ends panels and keeps the app in background', () => {
    const bg = run(live(true, 2), { type: 'quit-request', source: 'cmd-q' }).state
    const { state, effects } = run(bg, { type: 'stop-all' })
    expect(state).toMatchObject({ phase: 'background', live: 0 })
    expect(effects).toEqual(['stop-all'])
  })

  it('launch after a clean exit offers nothing; after a crash or reboot it offers the layout', () => {
    const clean = run(initialLife(), { type: 'launch', layoutPanels: 3, cleanExit: true })
    expect(clean.state.resumeOffer).toBe(0)
    expect(clean.effects).toEqual(['clear-marker', 'show-window'])
    const crashed = run(initialLife(), { type: 'launch', layoutPanels: 3, cleanExit: false })
    expect(crashed.state.resumeOffer).toBe(3)
    expect(crashed.state.layoutPanels).toBe(3)
  })

  it('crash leaves an interrupted marker so the next launch offers resume', () => {
    const { state, effects } = run(live(true, 2), { type: 'crash' })
    expect(effects).toEqual(['write-interrupted-marker'])
    expect(state.live).toBe(0)
    const next = run(initialLife(), { type: 'launch', layoutPanels: 2, cleanExit: false })
    expect(next.state.resumeOffer).toBe(2)
  })

  it('resume reopens panels once; dismiss clears the offer', () => {
    const offered = { ...initialLife(), layoutPanels: 2, resumeOffer: 2 }
    expect(run(offered, { type: 'resume' })).toEqual({ state: { ...offered, resumeOffer: 0 }, effects: ['reopen-panels'] })
    expect(run(offered, { type: 'dismiss-resume' }).state.resumeOffer).toBe(0)
  })

  it('update with live panels asks first; declining installs on the next real quit', () => {
    const busy = live(true, 2)
    expect(run(busy, { type: 'update-ready' }).effects).toEqual(['ask-update-gate'])
    const declined = run(busy, { type: 'update-ready' }, { type: 'update-answer', restart: false })
    expect(declined.state.pendingInstall).toBe(true)
    expect(declined.state.phase).toBe('attached')
    const quit = run(declined.state, { type: 'quit-and-stop' })
    expect(quit.effects).toEqual(['stop-all', 'write-clean-marker', 'quit-and-install'])
  })

  it('accepting the update restart stops panels and marks the exit interrupted', () => {
    const { state, effects } = run(live(true, 2), { type: 'update-ready' }, { type: 'update-answer', restart: true })
    expect(effects).toEqual(['stop-all', 'write-interrupted-marker', 'quit-and-install'])
    expect(state).toMatchObject({ phase: 'quitting', live: 0 })
  })

  it('update with no live panels installs at once', () => {
    const { effects } = run(live(false, 0), { type: 'update-ready' })
    expect(effects).toEqual(['stop-all', 'write-interrupted-marker', 'quit-and-install'])
  })

  it('ignores events after quitting has begun', () => {
    const q = run(live(false, 0), { type: 'quit-request', source: 'cmd-q' }).state
    expect(run(q, { type: 'open' }).effects).toEqual([])
    expect(run(q, { type: 'quit-and-stop' }).effects).toEqual([])
  })

  it('toggling keepRunning changes the decision', () => {
    const s = run(live(false, 1), { type: 'keep-running', on: true }).state
    expect(quitMode(s)).toBe('background')
  })

  it('clamps negative or fractional counts', () => {
    expect(run(initialLife(), { type: 'live', count: -4 }).state.live).toBe(0)
    expect(run(initialLife(), { type: 'live', count: 2.9 }).state.live).toBe(2)
  })
})
