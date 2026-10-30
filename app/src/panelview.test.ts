import { describe, expect, it } from 'vitest'
import { gateCount, markOf, missingPanels, replayOpen } from './panelview'

describe('panel state marks', () => {
  it('gives each of the five states its own look', () => {
    const looks = (['working', 'waiting_approval', 'waiting_input', 'idle', 'error'] as const).map((state) => {
      const m = markOf({ state, since: 1 })!
      return `${m.state}/${m.shape ?? '-'}`
    })
    expect(new Set(looks).size).toBe(5)
  })
  it('shows the reason of an error and nothing for a closed panel', () => {
    expect(markOf({ state: 'error', reason: 'disconnected', since: 1 })!.label).toBe('Stopped: disconnected')
    expect(markOf({ state: 'closed', since: 1 })).toBeNull()
    expect(markOf(undefined)).toBeNull()
  })
})

describe('reattach replay', () => {
  const log = [{ kind: 'ready', sessionId: 's', model: 'sonnet', cwd: '/x/app' }, { kind: 'assistant', text: 'hi', tools: [] }]
  it('opens a panel from its ready event', () => {
    expect(replayOpen({ panel: 'p1', state: 'idle', log })).toEqual({ sid: 'p1', cwd: '/x/app', model: 'sonnet' })
    expect(replayOpen({ panel: 'p2', state: 'closed', log })).toBeNull()
  })
  it('skips panels the window already holds', () => {
    const snap = [{ panel: 'a', state: 'idle' as const, log }, { panel: 'b', state: 'working' as const, log }]
    expect(missingPanels(snap, ['a']).map((p) => p.panel)).toEqual(['b'])
  })
})

describe('update gate message', () => {
  it('reads the count from main', () => {
    expect(gateCount('Restarting now stops 3 panels that are still running. Restart now, or install.')).toBe(3)
    expect(gateCount('Restarting now stops 1 panel that is still running.')).toBe(1)
    expect(gateCount('Downloading')).toBe(0)
  })
})
